# Observability: logs, errors and Sentry

How the platform records what happens without recording who it happened to (issues #9 and #48, CLAUDE.md rule 2, NFR-9, ADR 0002, DPIA risk R5). The aim: names, phone numbers, FWO numbers and OTP codes never reach Workers Logs or Sentry. The main control is at the source (never log personal data, wrap queries in `safeQuery`); the rest are safety nets.

## The layers

| Layer | Where | What it does |
|---|---|---|
| Structured logger | `createLogger` in `src/modules/observability` | The only logging path (ESLint bans `console` elsewhere). One JSON object per line with `level`, `event` and `requestId`. Keys containing a personal-data word (`name`, `phone`, `fwo`, `otp`, `email`, `token`, …) and keys such as `code`, `message`, `detail`, `params` become `[redacted]`, unless the value is a boolean (`phoneVerified: true`). Strings are scrubbed; only flat values are accepted. Name counts without the word (`attempts`, not `otpAttempts`) |
| Safe errors | `safeErrorFields`, `SafeError` | An error is logged as its name, SQLSTATE, constraint, table and stack frames. Its `message`, `detail`, `params`, `query` and `cause` are never read, except the message of our own `SafeError`, which is scrubbed. Engine errors' messages are dropped too: they echo input (`JSON.parse` quotes the text it failed on). Next.js's numeric `digest` is kept |
| Database errors | `safeQuery`, `toSafeDatabaseError`, `SafeDatabaseError` in `src/db` | Module functions wrap their queries in `safeQuery`. Any Drizzle or Postgres failure, including a dropped connection with no SQLSTATE, is rethrown as a `SafeDatabaseError` (`sqlState`, `constraint`, `table`) with no cause, so nothing downstream can print the original. `isUniqueViolation(error, "member_phone_uq")` lets a module turn a conflict into a flag (BR-06) |
| Console guard | `installConsoleGuard`, from `src/instrumentation.ts` | Production builds only (`next dev` keeps full errors; non-production holds synthetic data only). Wraps `console.*` for code we don't control, chiefly Next.js printing an unhandled error. Errors become their safe fields; strings and objects are scrubbed. The logger's own lines pass through untouched. It can't see what the runtime records itself: workerd logs an uncaught exception's message, which is why raw errors must not escape a module |
| Sentry | `worker.ts`, `sentryOptions`, `scrubEvent` | Error events only. Request data, cookies, headers, bodies, query strings, user, IP, breadcrumbs and local variables are off. Tracing is off by leaving `tracesSampleRate` unset: Sentry treats `0` as on, and a client could then force spans that skip `beforeSend`. Never set `SENTRY_TRACES_SAMPLE_RATE`. `beforeSend` redacts every exception message except our own `SafeError`'s. Errors thrown inside Next.js reach Sentry through `onRequestError` in `src/instrumentation.ts` |

Why all of this: Drizzle's `DrizzleQueryError` message ends with `params: <values>`, and a Postgres unique violation's `detail` is `Key (phone_e164)=(+2547…) already exists.` Without these layers, the first phone or FWO conflict would put a member's number in the logs. `tests/integration/observability.test.ts` triggers exactly that conflict on real Postgres and checks every path.

Scrubbing is a safety net, not permission. It can't recognise a name in free text. Log ids (`registrationId`), counts and outcomes, never values a member typed.

## Using the logger

```ts
// In a route or server action:
const log = await getLogger(); // src/app/_lib/log.ts, carries the request id
await submitRegistration(db, input, { log });

// In a module:
log.info("registration.submitted", { registrationId, channel: "SELF" });
log.error("otp.send_failed", error, { provider: "africastalking" });
```

`event` is a dotted lower-case name. Anything else is replaced with `invalid_event_name`, so data can't be smuggled in through it.

## Request ids

`src/middleware.ts` sets `x-request-id` on every request: Cloudflare's ray id when present, so our lines match Cloudflare's invocation log, otherwise a random UUID. The response carries it as `X-Request-Id`. A staff member reporting a problem can quote it, and it finds every line for that request in Workers Logs.

## Workers Logs

Set in `wrangler.jsonc` for every environment:

| Setting | Value | Why |
|---|---|---|
| `head_sampling_rate` | `1` (every request) | Low traffic (a few thousand members), and when something goes wrong during registration week we need every line. Well within the plan's limits (Free: 200,000 events a day; Paid: 20 million a month included). Revisit if traffic grows |
| `redact_query_string` | `true` | Query strings are removed from request URLs in logs. Our URLs never carry personal data (rule 2); this protects against a mistake or a crafted link |
| `logs.invocation_logs` | `true` | One line per request (method, URL, outcome), needed to see failures that log nothing themselves. Cloudflare doesn't document which request fields it records: after the first staging deploy, open one invocation log and check for headers (cookies), client IP and `cf` geo data. If present, note it in the DPIA, or turn invocation logs off |
| `traces.enabled` | `false` | Automatic tracing is in beta and records subrequest metadata we haven't reviewed. Turn it on only after checking its attributes contain no personal data |
| Retention | Set by the plan: 3 days on Workers Free, 7 days on Workers Paid | Not configurable. Short retention suits us: logs are for live debugging, not records. The audit log (BR-12) is the record |

Cloudflare moves Workers Logs to Cloudflare Observability pricing on 1 December 2026; check the bill after the first month.

## Sentry setup (one-off, per environment)

The Sentry account is owned by the church email (D40); its data processing agreement is go-live item 10.

1. Create the organisation in Sentry's **EU (Frankfurt) data region**. The region can't be changed later.
2. Create one project (platform: Cloudflare Workers). In **Project Settings → Security & Privacy**, turn on **Data Scrubber**, **Use Default Scrubbers** and **Prevent Storing of IP Addresses**, and add `phone`, `fwo`, `otp`, `name` to **Additional Sensitive Fields**. This is server-side scrubbing on top of ours.
3. Set the DSN as a secret in each environment:

   ```bash
   pnpm exec wrangler secret put SENTRY_DSN --env staging
   ```

   ```bash
   pnpm exec wrangler secret put SENTRY_DSN --env production
   ```

   `SENTRY_ENVIRONMENT` is already set per environment in `wrangler.jsonc`. With no DSN (local development, CI), Sentry sends nothing.
4. Check it on staging: cause an error, then confirm the event in Sentry has no request headers, cookies, query string, user or IP, and that the exception message reads `[redacted]` unless it is one of ours.

## Adding to this

- A new kind of personal field: add its key to `DENIED_KEYS` or `DENIED_KEY_FRAGMENTS` in `scrub.ts`, with a test.
- A new third-party integration that logs: route its errors through `safeErrorFields` or `toSafeDatabaseError` before they reach a logger or Sentry.
- Never add `SENTRY_DEBUG` to staging or production: Sentry's debug output prints events before `beforeSend` runs (the console guard still scrubs it, but don't rely on that).
