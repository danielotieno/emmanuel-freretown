# ACK Emmanuel Freretown - Kengeleni Platform

The parish website and membership registry at ackemmanuelfreretown.org. Start with [`CLAUDE.md`](CLAUDE.md) for the rules and [`docs/`](docs/README.md) for requirements and architecture.

## Requirements

- Node.js 24 (`.nvmrc`) and pnpm 10 (`corepack enable`)
- A PostgreSQL database for local work and integration tests. **Docker is not needed.** Use your development branch in the `ack-nonprod` Neon project (ask the technical lead), or any local PostgreSQL 15+ you already have. Production is Neon, Postgres 18. The integration database's name must contain `test`: the suite wipes it.

## First run

```bash
pnpm install          # also compiles messages and Cloudflare types (pnpm gen)
cp .env.example .env  # then point the URLs at your Postgres
pnpm db:migrate       # applies src/db/migrations to DATABASE_URL
pnpm db:app-login     # creates the app's login (ack_app); paste the printed string into .env
pnpm dev              # http://localhost:3000, staff portal at http://admin.localhost:3000
```

Run `pnpm i18n:watch` in a second terminal while editing `messages/*.json`.

## Commands

| Command                        | What it does                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | Next.js dev server with Cloudflare bindings                                                  |
| `pnpm build` / `pnpm start`    | Production Node build and server (used by Playwright)                                        |
| `pnpm preview`                 | Build the Worker with OpenNext and run it locally in workerd                                 |
| `pnpm deploy`                  | Build and deploy to Cloudflare Workers                                                       |
| `pnpm check`                   | Types, lint, dependency rules, formatting and unit tests                                     |
| `pnpm test`                    | Unit tests (Vitest)                                                                          |
| `pnpm test:integration`        | Integration tests against real Postgres at `TEST_DATABASE_URL` (wiped and migrated each run) |
| `pnpm e2e`                     | Playwright on the four DESIGN.md viewports, with axe and the 200 KB budget (port 3100)       |
| `pnpm db:generate`             | Generate a migration from `src/db/schema`                                                    |
| `pnpm db:custom --name=<name>` | Create an empty SQL migration for what Drizzle cannot express                                |
| `pnpm db:migrate`              | Apply migrations to `DATABASE_URL` (owner role). Never `drizzle-kit push`                    |
| `pnpm db:app-login`            | Create the app's database login, or rotate its password; prints its connection string once   |
| `pnpm db:backup-login`         | Create the read-only backup login (`ack_backup`), or rotate its password                     |
| `pnpm db:drift`                | Compare a live database's schema with one built from the migrations                          |
| `pnpm auth:schema`             | Regenerate `src/db/schema/auth.ts` from the Better Auth config                               |
| `pnpm gen`                     | Compile Paraglide messages and generate `cloudflare-env.d.ts`                                |

### Running Playwright locally

The registration journey stores registrations, so `pnpm e2e` needs a migrated database
(`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, as the app's login) and test mode in
`.dev.vars`: no SMS is sent and every code is `000000` (`src/app/_lib/env.ts`). Never put a
Mobile Sasa token in the same `.dev.vars`: test mode refuses to run beside one.

```bash
E2E_TEST_MODE=1
OTP_SECRET=any-local-test-value-32-characters-or-more
RATE_LIMIT_SECRET=any-local-test-value-32-characters-or-more
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

The Turnstile key is Cloudflare's public always-pass test key. Against a remote database (such
as a Neon branch), run with `--workers=1`: every step is a database round trip, and parallel
browsers slow each other down. CI runs against a local Postgres container.

## Layout

```
messages/            en.json and sw.json: all member-facing text
project.inlang/      Paraglide project settings
src/
  app/(public)/      landing, registration, status check, voting (root layout per locale)
  app/admin/         staff portal, served on the admin hostnames listed in src/middleware.ts
  app/_lib/          request helpers for routes: locale, database handle
  modules/           business logic; each module's public API is its index.ts
  db/schema/         Drizzle schema, written from docs/architecture/database-design.md
  db/migrations/     generated and hand-written SQL migrations (committed)
  i18n/              locale resolution
tests/integration/   database tests against real Postgres
tests/e2e/           Playwright
```

## Database roles

Migrations create two `NOLOGIN` roles: `app_runtime` (what the application may do) and `readonly_ops` (investigations). In each environment, create a login role for the app and `GRANT app_runtime TO <login role>`; Hyperdrive connects as that login role. Migrations run as the owner. A new table needs its grants in the same migration.

## Working on an issue

See "How we work" in [`CLAUDE.md`](CLAUDE.md): one issue, one branch (`<number>-<name>`), one pull request with `Closes #<number>`, template checklist filled in.

## Environments

See the amendment in [ADR 0002](docs/architecture/adr/0002-hosting.md): production and non-production are separate Neon projects; staging and development never hold real members' data. Setting up the environments is in [docs/operations/environments.md](docs/operations/environments.md); deployment is tracked in the GitHub issues.
