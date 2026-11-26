# Environments: Neon, Hyperdrive and Cloudflare

How to set up and maintain staging and production (issue #6, ADR 0002 and its amendment). These steps run in the technical lead's Neon and Cloudflare accounts (D40), so they need the account owner or an invited administrator. Nothing on this page should ever contain a password or connection string.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Neon project `ack-production` (Postgres 18, 7-day restore) in AWS Frankfurt, account on Launch; one branch, `production` | Done 24 Nov 2026 (confirm the 7-day restore window in its settings) |
| 2 | Neon project `ack-nonprod` (Postgres 18) in AWS Frankfurt, default branch renamed `staging`, one branch per developer | Done 24 Nov 2026: `staging` and `dev-do` |
| 3 | Migrations applied as the owner; `ack_app` login created in each database | Done 24 Nov 2026: `dev-do`, `staging` and `production` (Postgres 18.7; `ack_app` verified on each; integration tests pass on `dev-do`) |
| 4 | Local development connects as `ack_app` | Done in the repo (`.env.example`, `wrangler.jsonc`) |
| 5 | Hyperdrive configs for staging and production, caching disabled; ids in `wrangler.jsonc` | Done 24 Nov 2026: `ack-staging` and `ack-production`, both connecting as `ack_app` with caching disabled; ids in `wrangler.jsonc` |
| 6 | Custom domains: apex, `admin.`, `staging.`, `admin-staging.` | Created by the first deploy (`backups-and-rollback.md`). Also turn on **Always Use HTTPS** for the zone (SSL/TLS → Edge Certificates); the live smoke test checks it |
| 7 | Cloudflare Access in front of `admin.` and `admin-staging.` | Done 24 Nov 2026: team `ack-emmanuel`; apps `ACK staff portal (production)` and `(staging)` with reusable policies `ACK staff (production)` and `(staging)`; One-time PIN only, instant auth, 24-hour sessions |
| 8 | Secrets in Cloudflare; local ones documented in `.dev.vars.example` | Example done; secrets added as each feature lands |
| 9 | Job queues `ack-jobs-staging` and `ack-jobs-production` (#10) | Done 24 Nov 2026: both created with `wrangler queues create`. A Worker bound to a missing queue fails to deploy, so a new environment needs its queue first |
| 10 | `CF_ACCESS_AUD` secret in staging and production (§5); first Super Administrator in each (§8) | Secrets done 26 Nov 2026: `BETTER_AUTH_SECRET` and `CF_ACCESS_AUD` set in staging and production. First Super Administrator: staging done 26 Nov 2026 (before the #17 deploy; signing in needs it); production to do after #17 is deployed |

## The rules

- **Production and non-production never share a Neon project, and production is never branched into non-production.** A Neon branch copies all data, so a branch of production would put real members' religious affiliation in a less protected place (ADR 0002 amendment).
- **The app never connects as the owner.** Every environment has two kinds of connection:
  - **Owner** (`neondb_owner`, or `postgres` locally): runs migrations only. Its connection string is the `DATABASE_URL` used by `pnpm db:migrate` and, later, the deploy pipeline (#7).
  - **App login** (`ack_app`): a member of `app_runtime` that owns nothing (database-design.md §4). Hyperdrive and local development use this one, so a missing grant fails in development, not in production.
- Hyperdrive caching is **disabled** for every config. The registry must never serve a stale status or a stale "already voted".
- **One deliberate cache (#88):** the homepage's list of active HBCs (ids and names, no personal data) is held in Cloudflare's Cache API for 6 hours in each Cloudflare data centre, under `https://<host>/_cache/hbcs-active/v1`, so bot traffic doesn't keep Neon awake. Registration and the status check are never cached. After an administrator adds, renames or retires an HBC, the homepage can show the old list for up to 6 hours. To refresh it everywhere, purge that URL in the Cloudflare dashboard (Caching → Configuration → Custom Purge), or deploy with the key's version bumped (`v1` → `v2` in `src/app/(public)/page.tsx`), or wait.
- Connection strings and secrets live in Cloudflare, GitHub Actions secrets or a local `.env` / `.dev.vars`. Never in the repository, an issue or a chat.

## 1. Neon projects

Neon lives in the technical lead's personal Neon account (D40). A Neon account has **one plan for all its projects**, so production and non-production share it. The account is on **Launch** (D26): production needs its 7-day restore window and must never be paused by a monthly limit, and `ack-nonprod` sleeps when unused, so it costs cents. Both projects are billed by usage, with no monthly minimum, and the US$20 ceiling covers the whole account.

1. Project **`ack-production`**: Postgres **18**, region **AWS Europe Central 1 (Frankfurt)**. In its settings, set the restore window (history retention) to **7 days**. Its only branch is the default, **`production`**. Delete any other branch Neon creates. The only other branches it should ever have are the short-lived restore branches the deploy pipeline makes before a migration (#7).
2. Project **`ack-nonprod`**: Postgres 18, same region. Keep its restore window short (1 day is plenty) to keep its storage cost near zero.
3. In `ack-nonprod`, rename the default branch to **`staging`**. Create one branch per developer from it (for example `dev-<initials>`) and, on each developer branch, a second database named `ack_test` for the integration tests. "Reset from parent" refreshes a developer branch from staging. Nothing in this project is ever copied from production.

Notes:
- **The region can't be changed after a project is created.** If a project is in the wrong region, delete it (while it holds no real data) and create it again.
- Two separate projects, never two branches of one project. Branches share their project's credentials and console access, and a branch made from production copies real members' data.
- So the church doesn't depend on one person's login: share `ack-production` with a second account (a church email held by the Vicar) as a collaborator, and keep a note of who has access in the parish's records.

Use each database's **direct** connection string (the host without `-pooler`) for migrations and for Hyperdrive. Hyperdrive does its own pooling. Change `sslmode=require` in the copied string to **`sslmode=verify-full`**: the `pg` driver treats them the same today, but its next major version weakens `require` to encrypt without checking the server's certificate.

## 2. Migrate and create the app login

For each database (production, staging, each developer branch), on a trusted machine:

```bash
export DATABASE_URL='<owner connection string, direct endpoint>'   # paste, don't commit
pnpm db:migrate
APP_URL=$(pnpm -s db:app-login)   # creates ack_app, or rotates its password; prints the string once
```

`db:app-login` refuses to finish if the login would be a superuser, could create roles or databases, owns anything, or doesn't inherit `app_runtime`. Neon roles belong to a branch, and a new branch copies its parent's roles and passwords. So run it on every branch, including right after creating a developer branch, so each branch has its own `ack_app` password.

For a developer branch or a local Postgres, paste `$APP_URL` into `.env` as `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.

## 3. Hyperdrive (staging and production)

With `APP_URL` from step 2 for that environment:

```bash
pnpm exec wrangler hyperdrive create ack-staging --connection-string="$APP_URL" --caching-disabled
pnpm exec wrangler hyperdrive create ack-production --connection-string="$APP_URL" --caching-disabled
```

Copy each returned id into `wrangler.jsonc`, replacing `REPLACE_WITH_STAGING_HYPERDRIVE_ID` and `REPLACE_WITH_PRODUCTION_HYPERDRIVE_ID`, in a pull request. The ids are not secrets. Confirm caching is off with `pnpm exec wrangler hyperdrive get <id>`.

**Rotating the app password:** run step 2's `db:app-login` again, then `pnpm exec wrangler hyperdrive update <id> --connection-string="$APP_URL"`. The old password stops working immediately, so do it outside registration hours.

## 4. Domains

The `ackemmanuelfreretown.org` zone must be on Cloudflare in the church account. The four hostnames are already declared as Worker **custom domains** in `wrangler.jsonc`:

| Hostname | Environment |
|---|---|
| `ackemmanuelfreretown.org` | production, public |
| `admin.ackemmanuelfreretown.org` | production, staff |
| `staging.ackemmanuelfreretown.org` | staging, public |
| `admin-staging.ackemmanuelfreretown.org` | staging, staff (one level deep, so the free certificate covers it) |

The first deploy to each environment (#7) creates the DNS records and certificates. Remove any existing DNS record for those names first, or the deploy fails.

## 5. Cloudflare Access (staff hosts)

In Cloudflare Zero Trust → Access → Applications, add a **self-hosted** application for `admin.ackemmanuelfreretown.org` and another for `admin-staging.ackemmanuelfreretown.org`:

- Policy: **Allow**, with an explicit list of staff email addresses. Super Administrators keep the list current when staff change.
- Login method: one-time PIN by email, added under Zero Trust → Integrations → Identity providers. Don't select the built-in "Cloudflare" provider on the apps; staff don't have Cloudflare accounts.
- Keep the allow-lists as reusable policies (Access controls → Policies), one per environment, so a staff change is one edit. When someone leaves, also revoke their session under Team & Resources → Users.
- Session duration: 24 hours.

Access is a gate in front of the staff portal, not its security boundary. Staff still sign in to the app with a password and a second factor, and authorisation stays in the modules and server actions (CLAUDE.md rule 1).

**The app checks Access's JWT too (#17).** Every staff page, action and auth endpoint verifies the `Cf-Access-Jwt-Assertion` header Access adds: signed by the team's current key, issued by `https://ack-emmanuel.cloudflareaccess.com`, for this environment's application, not expired. So a request that reaches the Worker without passing Access is still refused. It needs two settings per environment:

- `CF_ACCESS_TEAM_DOMAIN`: `ack-emmanuel.cloudflareaccess.com`, already in `wrangler.jsonc` `vars` for staging and production.
- `CF_ACCESS_AUD`: the application's **Application Audience (AUD) tag**, from Zero Trust → Access → Applications → the app → Overview (Basic information). It isn't secret; it's a Wrangler secret only so it can be set without a code change:

  ```bash
  pnpm exec wrangler secret put CF_ACCESS_AUD --env staging
  ```

  ```bash
  pnpm exec wrangler secret put CF_ACCESS_AUD --env production
  ```

Without both, staging and production refuse **every** staff request (the staff host answers 404), so set them before the first deploy that includes #17. Recreating an Access application gives it a new AUD tag; update the secret when that happens. Locally, with neither set, the check is skipped.

## 6. Secrets

Each feature adds its own secret when it lands; `.dev.vars.example` lists the expected names. For staging and production:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production
```

Secrets in use:

| Name | Issue | What |
|---|---|---|
| `BETTER_AUTH_SECRET` | #17 | Staff sessions: signs cookies and encrypts authenticator secrets and backup codes. 32+ random characters. Changing it signs every staff member out and makes their authenticator apps unusable (each must be reset), so don't rotate it casually |
| `CF_ACCESS_AUD` | #17 | The Access application's AUD tag (§5). Staff requests are refused without it |
| `TURNSTILE_SECRET_KEY` | #13 | Turnstile server-side verification (the widget's secret key) |
| `RATE_LIMIT_SECRET` | #13 | HMAC key for rate-limit keys (phone numbers, IPs); 32+ random characters |
| `OTP_SECRET` | #15 | HMAC key for OTP codes and verification tokens; 32+ random characters. Changing it invalidates codes and tokens issued in the last few minutes, nothing else |
| `MOBILESASA_API_TOKEN` | #14 | Mobile Sasa `mbs_` token with the "send messages" scope (D43) |
| `MOBILESASA_WEBHOOK_SECRET` | #14 | Mobile Sasa's webhook signing secret (portal: Settings → Webhooks) |
| `SENTRY_DSN` | #9 | Error reports |

Plain variables (not secret): `TURNSTILE_SITE_KEY` (#16), the widget's public site key, set per environment in `wrangler.jsonc` `vars`. Create the widget in Cloudflare (Turnstile → Add widget, Managed mode) for the environment's public hostname; without the key, staging and production show no widget and nobody can get a code. Locally and in CI the app falls back to Cloudflare's always-pass test key. `E2E_TEST_MODE` is for automated tests only and must never be set in staging or production; it also refuses to run where a Mobile Sasa token exists. `MOBILESASA_SENDER_ID` (default `MOBILESASA`, the shared sender, until our own is approved) and `MOBILESASA_CALLBACK_URL` (`https://<host>/api/webhooks/sms-delivery` for the environment). Set them as secrets too, or in `wrangler.jsonc` `vars` per environment.

Use different values in each environment. The deploy pipeline's own secrets (Cloudflare API token, owner `DATABASE_URL` per environment for migrations) are GitHub Actions secrets, set up in #7.

## 7. Job queues

The Worker consumes and produces a Cloudflare Queue for background job retries (`database-design.md` §6, #10). Bindings aren't inherited, so each environment names its own queue in `wrangler.jsonc`, and the queue must exist before a Worker bound to it can deploy. Create both once:

```bash
pnpm exec wrangler queues create ack-jobs-staging
```

```bash
pnpm exec wrangler queues create ack-jobs-production
```

Queues are included in Workers Paid (ADR 0002). Messages carry a job type and a row id only, never personal data. `pnpm dev` and `pnpm preview` use a local simulated queue (`ack-jobs-local`); nothing needs creating for them.

The daily Cron Trigger (`0 1 * * *`) needs no setup: `wrangler deploy` registers it. To see recent runs, open the Worker in the Cloudflare dashboard → Settings → Trigger events, or filter Workers Logs on `event = "jobs.daily_finished"`.

## 8. The first Super Administrator

Staff users are never seeded from the repository (database-design.md §5). Once per environment, after the migrations, create the first Super Administrator on a trusted machine with the owner's connection string:

```bash
DATABASE_URL='<owner connection string, direct endpoint>' pnpm staff:bootstrap --email <their address> --name "<their name>"
```

The email and name stay in your shell history; on a shared machine, close the terminal afterwards and delete that line from your history file (`~/.zsh_history` or `~/.bash_history`). Run the command in one terminal tab, after setting `DATABASE_URL` there: the script ignores `.env`, and prints the database host before asking for anything, so check it. It asks twice for their password (not shown; at least 12 characters), then creates the staff user, their password login and a GLOBAL Super Administrator grant, with audit entries, in one transaction. It refuses if an active Super Administrator already exists. Run it with the person beside you so they type their own password, or have them run it.

Then the Super Administrator opens the staff host (`admin.` or `admin-staging.`), passes Cloudflare Access (their email must be on the environment's allow-list, §5), signs in with the password and sets up an authenticator app. They can reach nothing else until they do. The 30-minute idle timeout applies to them (D32).

Locally, `pnpm dev` serves the staff portal on `http://admin.localhost:3000`; put a `BETTER_AUTH_SECRET` in `.dev.vars` first.
