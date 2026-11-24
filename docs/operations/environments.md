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
| 6 | Custom domains: apex, `admin.`, `staging.`, `admin-staging.` | Not started (routes already in `wrangler.jsonc`) |
| 7 | Cloudflare Access in front of `admin.` and `admin-staging.` | Done 24 Nov 2026: team `ack-emmanuel`; apps `ACK staff portal (production)` and `(staging)` with reusable policies `ACK staff (production)` and `(staging)`; One-time PIN only, instant auth, 24-hour sessions |
| 8 | Secrets in Cloudflare; local ones documented in `.dev.vars.example` | Example done; secrets added as each feature lands |

## The rules

- **Production and non-production never share a Neon project, and production is never branched into non-production.** A Neon branch copies all data, so a branch of production would put real members' religious affiliation in a less protected place (ADR 0002 amendment).
- **The app never connects as the owner.** Every environment has two kinds of connection:
  - **Owner** (`neondb_owner`, or `postgres` locally): runs migrations only. Its connection string is the `DATABASE_URL` used by `pnpm db:migrate` and, later, the deploy pipeline (#7).
  - **App login** (`ack_app`): a member of `app_runtime` that owns nothing (database-design.md §4). Hyperdrive and local development use this one, so a missing grant fails in development, not in production.
- Hyperdrive caching is **disabled** for every config. The registry must never serve a stale status or a stale "already voted".
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

## 6. Secrets

Each feature adds its own secret when it lands; `.dev.vars.example` lists the expected names. For staging and production:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production
```

Use different values in each environment. The deploy pipeline's own secrets (Cloudflare API token, owner `DATABASE_URL` per environment for migrations) are GitHub Actions secrets, set up in #7.
