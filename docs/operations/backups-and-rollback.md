# Deploys, rollback, backups and drift

How code reaches staging and production, how to undo a bad deploy, and how the database is backed up and checked (issues #7 and #8; NFR-7; ADR 0002 and 0003). Environments themselves are in `environments.md`.

## Status

| # | Item | Status |
|---|---|---|
| 1 | GitHub environments `staging` and `production`, deployments from `main` only | Done 24 Nov 2026. Required reviewers aren't available on this repository's plan, so production deploys only when started by hand |
| 2 | Deploy workflow (`.github/workflows/deploy.yml`) | Configured 24 Nov 2026. The first two staging runs failed at the Worker upload after migrating (#49: missing local Hyperdrive placeholder); fixed, and the Worker is now built before migrations run |
| 3 | Cloudflare API token for deploys | Done 24 Nov 2026: `github-deploy-ack-emmanuel`, this account and zone only, expires Nov 2027. Remove its R2 permission if the R2 token list still shows it |
| 4 | Neon API key and project id for restore branches | Done 24 Nov 2026 (`NEON_PROJECT_ID` = `ack-production`'s id) |
| 5 | R2 enabled; bucket `ack-backups` in the EU jurisdiction with a 35-day lifecycle rule | Done 24 Nov 2026 (location EEUR; rule `expire-35-days`). R2 token scoped to `ack-backups`, expires Nov 2027 |
| 6 | Backup login `ack_backup` on staging and production | Done 24 Nov 2026; verified read-only on both |
| 7 | age key pair; private key held offline | Done 24 Nov 2026: public key set; round trip tested. Private key: technical lead's password manager and a sealed copy with the Vicar |
| 8 | Nightly backup (`backup.yml`) running | First manual run after this merges |
| 9 | Weekly drift check (`drift.yml`) running | First manual run after this merges |
| 10 | Restore drill performed before go-live, then monthly | Not started |

## How deploys work

| | Staging | Production |
|---|---|---|
| When | Automatically, after CI passes on a push to `main` | When a maintainer runs **Actions → Deploy → Run workflow → production** on `main` |
| Guard | CI must pass | The commit's CI on `main` must have passed (checked by the workflow) |
| Before migrating | — | A Neon **restore branch** `pre-deploy-<sha>-<run>` is created (no compute; deleted after 7 days). Its name is in the run summary |
| Steps | Build the Worker, `pnpm db:migrate` as owner, `opennextjs-cloudflare deploy --env staging`, live smoke test. Building first means a build failure stops the run before the database changes | Same, with `--env production` |
| Smoke test | `scripts/live-smoke.sh`: the page renders in Kiswahili, the CSP is sent, http redirects to https, there's no `/admin` on the public host, and the staff host redirects to Cloudflare Access ||

Migrations are **forward-only**, in expand/contract steps: add the new thing, move the data, and remove the old thing in a later release. That way the previous Worker version still works if the Worker has to be rolled back.

### Secrets and variables

Set these with `gh`; it prompts for each value, so nothing ends up in shell history or chat. Use `--env staging` for the staging ones.

| Name | Kind | Environments | Value |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | staging, production | The deploy token (below) |
| `CLOUDFLARE_ACCOUNT_ID` | variable | staging, production | Your Cloudflare account id (not secret) |
| `DATABASE_URL` | secret | staging, production | That environment's **owner** string, direct endpoint, `sslmode=verify-full` |
| `NEON_API_KEY` | secret | production | Neon API key |
| `NEON_PROJECT_ID` | variable | production | `ack-production`'s project id (Settings → General) |
| `BACKUP_DATABASE_URL` | secret | staging, production | The `ack_backup` string from `pnpm db:backup-login` |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | secret | production | The R2 token for the backup bucket (below) |
| `R2_BACKUP_BUCKET` | variable | production | `ack-backups` |
| `AGE_RECIPIENT` | variable | production | The age **public** key (`age1…`) |

```bash
gh secret set DATABASE_URL --env production
```

```bash
gh variable set CLOUDFLARE_ACCOUNT_ID --env production --body '<account id>'
```

### The Cloudflare deploy token

Cloudflare can't limit a token to a single Worker. The narrowest it allows is one account and one zone. In **My Profile → API Tokens → Create Token**, start from the **Edit Cloudflare Workers** template, then:
- **Account resources:** only your account.
- **Zone resources:** only `ackemmanuelfreretown.org`.
- **Remove** the permissions we don't use (KV, D1, R2, Pages, Queues). Keep Workers Scripts, Workers Routes, Workers custom domains, Hyperdrive (read) and Account Settings (read).
- Optionally restrict **client IP**: GitHub runners' IPs change, so leave it open, and set a **TTL** (for example 1 year) with a reminder to rotate it.

### The Neon API key

Neon → **Account settings → API keys → Create**. A personal-account key can manage every project in the account, so keep it only in the `production` environment secret, and revoke it in Neon if it ever leaks.

## Rolling back

**The Worker (code)**, in seconds, with no data risk:

```bash
pnpm exec wrangler deployments list --env production
```

```bash
pnpm exec wrangler rollback <version-id> --env production -m "reason"
```

Or use the dashboard: Workers → `ack-emmanuel-freretown-production` → Deployments. Because migrations are forward-only, the previous version works against the newer schema.

**The database**: only when a migration damaged data. Every write since the restore point is lost, so agree it with the Vicar first and tell the office which registrations to re-enter.
1. Put the site in maintenance: roll the Worker back, or deploy a maintenance page.
2. Neon → `ack-production` → **Backup & Restore**: restore branch `production` to the time just before the deploy. The run summary shows the restore branch's name, which marks that moment. Neon keeps the pre-restore state as a backup branch.
3. Run the drift check against production (**Actions → Schema drift check → Run workflow**).
4. Deploy the matching code version.

## Backups

- **Neon restore window:** 7 days of point-in-time history on `ack-production` (D26). This is the first line of defence.
- **Nightly logical backup** (`backup.yml`, 04:00 Nairobi time):
  - `pg_dump` as `ack_backup` (read-only), encrypted with age, streamed to R2 bucket `ack-backups`.
  - The bucket is in Cloudflare's **EU jurisdiction**, so the data stays in the EU (NFR-1).
  - Objects are deleted after **35 days**, so data redacted under BR-14 doesn't live on in old backups.
  - Nothing unencrypted is written to disk (DPIA R8).

### One-time setup

1. **Enable R2:** Cloudflare dashboard → **Storage & databases → R2** → enable (accept the terms).
2. **Create the bucket and lifecycle rule:**

   ```bash
   pnpm exec wrangler r2 bucket create ack-backups --jurisdiction eu
   ```

   ```bash
   pnpm exec wrangler r2 bucket lifecycle add ack-backups expire-35-days --expire-days 35 --jurisdiction eu
   ```

3. **R2 token:** R2 → **Manage API tokens → Create**, permission **Object Read & Write**, applied to bucket **`ack-backups` only**. Store its access key id and secret as the `R2_*` secrets.
4. **Backup login** on staging and production, with each environment's owner string as `DATABASE_URL` (as in `environments.md` step 2):

   ```bash
   BACKUP_URL=$(pnpm -s db:backup-login)   # ack_backup: reads everything, writes nothing
   ```

   ```bash
   printf '%s' "$BACKUP_URL" | gh secret set BACKUP_DATABASE_URL --env production
   ```

5. **age key pair**, on your own machine (`brew install age`):

   ```bash
   age-keygen -o ack-backup.key
   ```

   It prints the public key (`age1…`); set it as `AGE_RECIPIENT`. Then move `ack-backup.key` into your password manager and keep a printed copy with the Vicar, sealed. **Without this private key, no backup can be read. It must never be stored in GitHub, Cloudflare or the repository.** Then delete the file.
6. Run **Actions → Nightly backup → Run workflow** once, and check the summary shows an encrypted object of a sensible size.

## Drift check

`drift.yml` runs every Monday. It builds a database from the committed migrations, then compares staging and production with it using `pnpm db:drift`. The comparison covers tables, columns, CHECK and exclusion constraints, indexes, functions, triggers, table, column and function grants, policies, enums and applied migrations. It reads definitions only, never member data.

A failure means a live database was changed outside the migrations, or a migration wasn't applied. GitHub emails the failure to the person who last changed the workflow's schedule. Fix it with a migration, never by hand.

## Restore drill

Monthly, and before registration opens. About 15 minutes.

1. Neon → `ack-production` → **Branches → New branch** from `production`, named `restore-drill-<date>`, **auto-delete after 1 day**. On that branch, add a database named `ack_restore`.
2. On your machine (`brew install age libpq`), put the owner strings for `ack_restore` and `neondb` on that branch in `RESTORE_DATABASE_URL` and `LIVE_COPY_URL`, then:

   ```bash
   scripts/restore-drill.sh production/<latest>.dump.age ~/path/to/ack-backup.key
   ```

   Find the latest backup's name in the dashboard: R2 → `ack-backups` → Objects, under `production/`. (Wrangler can't list objects.)
3. The schema check must say **No drift**. Row counts should match, apart from registrations made since the backup.
4. Delete the temporary branch, take the private key out of your working folder, and record the drill below.

| Date | Backup restored | Time to restore | Result | By |
|---|---|---|---|---|
| _first drill: before registration opens_ | | | | |
