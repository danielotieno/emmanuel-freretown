# Environments: Neon, Hyperdrive and Cloudflare

How to set up and maintain staging and production (issue #6, ADR 0002 and its amendment). These steps run in the church-owned Neon and Cloudflare accounts (D40), so they need the account owner or an invited administrator. Nothing on this page should ever contain a password or connection string.

## Status

| # | Item | Status |
|---|---|---|
| 1 | Neon project `ack-production` (Launch organisation, 7-day restore) in AWS Frankfurt | Not started |
| 2 | Neon project `ack-nonprod` (Free organisation) in AWS Frankfurt, branches `staging` and one per developer | Not started |
| 3 | Migrations applied as the owner; `ack_app` login created in each database | Not started (script ready: `pnpm db:app-login`) |
| 4 | Local development connects as `ack_app` | Done in the repo (`.env.example`, `wrangler.jsonc`) |
| 5 | Hyperdrive configs for staging and production, caching disabled; ids in `wrangler.jsonc` | Not started |
| 6 | Custom domains: apex, `admin.`, `staging.`, `admin-staging.` | Not started (routes already in `wrangler.jsonc`) |
| 7 | Cloudflare Access in front of `admin.` and `admin-staging.` | Not started |
| 8 | Secrets in Cloudflare; local ones documented in `.dev.vars.example` | Example done; secrets added as each feature lands |

## The rules

- **Production and non-production never share a Neon project, and production is never branched into non-production.** A Neon branch copies all data, so a branch of production would put real members' religious affiliation in a less protected place (ADR 0002 amendment).
- **The app never connects as the owner.** Every environment has two kinds of connection:
  - **Owner** (`neondb_owner`, or `postgres` locally): runs migrations only. Its connection string is the `DATABASE_URL` used by `pnpm db:migrate` and, later, the deploy pipeline (#7).
  - **App login** (`ack_app`): a member of `app_runtime` that owns nothing (database-design.md §4). Hyperdrive and local development use this one, so a missing grant fails in development, not in production.
- Hyperdrive caching is **disabled** for every config. The registry must never serve a stale status or a stale "already voted".
- Connection strings and secrets live in Cloudflare, GitHub Actions secrets or a local `.env` / `.dev.vars`. Never in the repository, an issue or a chat.

## 1. Neon projects

Neon sets the plan per **organisation**, not per project, so production and non-production live in two organisations. That also keeps their member lists and credentials apart. In the Neon console, signed in to the church-owned account:

1. Organisation **ACK Emmanuel — Non-production**, Free plan. Project **`ack-nonprod`**: Postgres 17, region **AWS Europe Central 1 (Frankfurt)**.
2. Organisation **ACK Emmanuel — Production**, Launch plan (D26; billing card in the church's name). Project **`ack-production`**: Postgres 17, same region. In its settings, set the restore window (history retention) to **7 days**.
3. In `ack-nonprod`, create branch **`staging`** and one branch per developer (for example `dev-<initials>`), each from the project's empty default branch. Never create these from production.

Notes:
- **The region can't be changed after a project is created.** If a project is in the wrong region, delete it (while it holds no real data) and create it again.
- A project can be moved to an organisation on the same plan or a higher one (Free → Launch), keeping its connection strings, but not from Launch down to Free.
- Invite the technical lead to both organisations as an admin. The church email held by the Vicar stays the owner (D40).

Use each database's **direct** connection string (the host without `-pooler`) for migrations and for Hyperdrive. Hyperdrive does its own pooling.

## 2. Migrate and create the app login

For each database (production, staging, each developer branch), on a trusted machine:

```bash
export DATABASE_URL='<owner connection string, direct endpoint>'   # paste, don't commit
pnpm db:migrate
APP_URL=$(pnpm -s db:app-login)   # creates ack_app, or rotates its password; prints the string once
```

`db:app-login` refuses to finish if the login would be a superuser, could create roles or databases, owns anything, or doesn't inherit `app_runtime`. Neon roles belong to a branch, so run it on every branch.

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
- Login method: one-time PIN by email (no extra identity provider needed).
- Session duration: 24 hours.

Access is a gate in front of the staff portal, not its security boundary. Staff still sign in to the app with a password and a second factor, and authorisation stays in the modules and server actions (CLAUDE.md rule 1).

## 6. Secrets

Each feature adds its own secret when it lands; `.dev.vars.example` lists the expected names. For staging and production:

```bash
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging
pnpm exec wrangler secret put BETTER_AUTH_SECRET --env production
```

Use different values in each environment. The deploy pipeline's own secrets (Cloudflare API token, owner `DATABASE_URL` per environment for migrations) are GitHub Actions secrets, set up in #7.
