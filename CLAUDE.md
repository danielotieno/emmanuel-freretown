# ACK Emmanuel Kengeleni-Freretown Platform

The church's digital platform at ackemmanuelfreretown.org. Release 1 is the membership registry (self and assisted registration, admin review, status check). Release 2 is elections and online voting.

This system holds sensitive personal data: church membership reveals religious affiliation, which is sensitive under Kenya's Data Protection Act, 2019. Treat every change with that in mind.

## How we work

- **One issue, one branch, one pull request.** Work comes from the GitHub issues, in order. Branch as `<issue-number>-<short-name>` (e.g. `12-phone-otp`) and open the PR with `Closes #<issue-number>`. Don't mix unrelated changes into a PR; open an issue for them instead.
- Every PR fills in the template checklist (`.github/pull_request_template.md`) and passes CI before merge.
- A decision that changes an ADR or a business rule is its own issue and PR, agreed before the code that depends on it.
- Never put real members' details in issues, PRs, commits, test fixtures or screenshots. Use synthetic data.

## Read before working

- `CONTEXT.md` — domain vocabulary. Use these terms exactly in code, tests and docs.
- `docs/product/requirements.md` — what Release 1 must do (business rules BR-*, functional requirements FR-*, non-functional NFR-*)
- `docs/architecture/domain-model.md` — entities, invariants, lifecycles, elections design
- `docs/architecture/database-design.md` — the source of truth for tables and constraints
- `docs/architecture/adr/` — decisions already made; don't relitigate them silently
- `PRODUCT.md` — audience and design intent (used by Impeccable)
- `DESIGN.md` — palette, contrast rules, typography, breakpoints, imagery. Use its tokens; don't invent colours

If a requirement is ambiguous, ask. Don't invent rules (for example, there is no FWO length rule yet).

## Dates

- Registration build complete: 26 November 2026
- Registration open to members: about 30 November – 1 December 2026
- Voting pilot (non-binding, paper is official): 13 December 2026, Jerusalem and Zion Freretown HBCs
- Official elections: January 2027

## Stack

Next.js (App Router), TypeScript strict, React, Tailwind CSS v4, shadcn/ui, Zod, Drizzle ORM 0.45.x (ADR 0003), PostgreSQL on Neon (EU/Frankfurt), Cloudflare Workers via `@opennextjs/cloudflare` with Hyperdrive (query caching disabled), Better Auth (staff only), Paraglide JS (English + Kiswahili), Africa's Talking (SMS), Cloudflare Cron Triggers (jobs), Cloudflare Turnstile, Sentry, Vitest, Playwright, pnpm.

## Routes

| URL | Purpose |
|---|---|
| `ackemmanuelfreretown.org/` | Public landing page: church, services, programmes |
| `/registration` | Self-registration, including "I am new / no FWO yet" |
| `/registration/status` | Check my status (OTP first) |
| `/vote` | Elections: schedule when closed, ballot when open |
| `admin.ackemmanuelfreretown.org` | Staff: review queue, officer desk, members, settings. Separate host, separate host-only cookie, behind Cloudflare Access |

## Code layout

```
src/
  modules/            business logic; no imports from `next`
    organisation/     HBCs, departments
    registration/     intake, revisions, review, corrections
    membership/       members, statuses, HBC history
    verification/     phone OTP, verification evidence
    access/           staff users, roles, scopes
    audit/            append-only log, retention redaction
    notifications/    SMS outbox, templates (en/sw)
    observability/    logger, safe errors, console guard, Sentry options (no personal data)
    elections/        Release 2
  app/                Next.js routes: thin adapters only
  db/                 Drizzle schema, migrations, seeds
  jobs/               Cron Trigger entry points
```

Each module exposes a small public API from its `index.ts`. Other code imports only from there. A dependency-cruiser rule enforces this.

## Non-negotiable rules

1. **Authorisation lives in module functions and server actions.** Middleware and layout guards are for redirects only, never the security boundary.
2. **No personal data in logs, Sentry, analytics or URLs.** Names, phone numbers, FWO numbers and OTP codes never leave the database except in the UI of an authorised user and in the SMS to the member's own phone.
3. **Public endpoints never reveal whether an FWO number or phone exists.** Duplicate FWOs are flagged for the administrator, not shown to the public. Every non-match on the status check returns the same message.
4. **Every state change writes an audit entry in the same transaction.**
5. **Database access only through modules.** No Drizzle in components or route files.
6. **Migrations are generated, reviewed and committed.** Never `drizzle-kit push` against staging or production. Constraints Drizzle can't express go in custom SQL migrations exactly as in `database-design.md`.
7. **Ballots never carry a member reference or a timestamp.** Don't add one for "debugging".
8. **OTP codes are stored hashed.** Every endpoint that can send an SMS has Turnstile and rate limits.
9. **All member-facing text goes through Paraglide, in English and Kiswahili.** No hard-coded strings on public pages or in SMS.
10. **Public pages stay light:** under 200 KB on first load, usable on 3G. Prefer server components; no heavy client libraries on `/registration` or `/vote`.
11. **Don't add a dependency without a reason** written in the PR description. Pin versions.

## Testing and done

A change is done when:
- types, lint and dependency rules pass
- unit tests cover the business rules it touches
- integration tests run against real Postgres (a Neon development branch, any local Postgres, or CI's service container), not mocks. Docker is not required
- an authorisation test exists for every role/action pair it adds
- the four critical journeys pass in Playwright: self-registration, assisted registration, approval, status check
- docs are updated if behaviour or a decision changed

## Commands

| Command | Use |
|---|---|
| `pnpm dev` | Dev server: public site on `localhost:3000`, staff portal on `admin.localhost:3000` |
| `pnpm check` | Types, lint, dependency rules, formatting, unit tests. Run before every commit |
| `pnpm test` / `pnpm test:integration` | Unit tests / integration tests against real Postgres at `TEST_DATABASE_URL` |
| `pnpm e2e` | Playwright on the four viewports, with axe and the 200 KB budget (port 3100) |
| `pnpm db:generate` / `pnpm db:custom --name=x` | Generate a migration / create an empty SQL migration |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:app-login` | Create or rotate the app's login (`ack_app`, member of `app_runtime`); the app never connects as the owner |
| `pnpm db:backup-login` / `pnpm db:drift` | Read-only backup login (`ack_backup`) / compare a live schema with the migrations (`DRIFT_EXPECTED_URL`, `DRIFT_ACTUAL_URL`) |
| `pnpm preview` / `pnpm smoke:worker` | Run the built Worker locally in workerd / smoke-test it (after an OpenNext build) |
| `pnpm deploy:staging` / `pnpm deploy:production` | Build and deploy to a named Cloudflare environment by hand. Normally the Deploy workflow does it, building first and migrating before the upload (see ADR 0002 amendment) |

Conventions set up with the scaffold:

- Host routing lives in `src/middleware.ts` (Edge). Don't migrate it to Next 16's `proxy.ts` until OpenNext supports Node middleware on Cloudflare officially: it returned 500 on any request with a cookie when tested.
- Every page sends a nonce-based Content-Security-Policy from `src/middleware.ts`. Pages must render dynamically (the nonce is per request). Adding a third-party script or frame (e.g. Turnstile) means adding its origin there.
- `wrangler.jsonc` top level is local only; deploys always name `--env staging` or `--env production`.
- Non-production environments never contain real members' data (ADR 0002 amendment).
- Server code calls messages with an explicit locale: `m.key({}, { locale })`, with `locale` from `getLocale()` in `src/app/_lib/i18n.ts`.
- Routes get the request's database handle from `getDb()` in `src/app/_lib/db.ts` and pass it to module functions.
- Log only through `createLogger` (`src/modules/observability`); routes get the request's logger from `getLogger()` in `src/app/_lib/log.ts`. Log ids, counts and outcomes, never personal data. Module functions wrap queries in `safeQuery` (`src/db`) so a raw Drizzle or Postgres error never leaves a module. See `docs/operations/observability.md`.
- The Worker entry is `worker.ts` (Sentry around OpenNext's handler). Only it imports `@sentry/cloudflare` at runtime: the SDK needs `cloudflare:workers`, which Node doesn't have.
- New tables need `app_runtime` (and, unless they hold credentials, `readonly_ops`) grants in the same migration (see `0002_privileges_and_redaction.sql`).
