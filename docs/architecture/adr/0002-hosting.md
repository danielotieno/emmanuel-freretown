# ADR 0002: Hosting — Cloudflare Workers + Neon Postgres (EU region)

| | |
|---|---|
| Status | Accepted, conditional on the data-protection steps in "Consequences" |
| Date | 24 November 2026 |
| Decided by | Danny (technical lead) |
| Supersedes | Earlier proposal to host in Kenya |

## Context

The church has little or no budget. The team considers Kenyan hosting providers unreliable. The application is small (about 600 members), with bursts of use on Sundays and election days. Membership data reveals religious affiliation, which is sensitive personal data under the Data Protection Act, 2019. Section 49 allows sensitive personal data to be processed outside Kenya only with the data subject's consent and confirmation of appropriate safeguards, and ODPC guidance treats storage on cloud servers outside Kenya as a cross-border transfer.

## Options considered

| Option | Cost | Notes |
|---|---|---|
| Kenyan VM + managed Postgres | Moderate | Simplest legally; rejected on reliability grounds |
| Supabase Free | $0 | Free projects pause after a week without activity; only two free projects. Unsuitable for a production registry used weekly |
| Neon Free (Postgres) | $0 | Permanent free plan, no card; 1 GB storage and 100 CU-hours per project per month; scales to zero after 5 minutes idle (short cold start). Upgrade to the pay-as-you-go Launch plan is a billing change, not a migration |
| Cloudflare Workers Free | $0 | 10 ms CPU per request is too tight for server-rendered Next.js |
| Cloudflare Workers Paid | $5/month | Enough CPU for Next.js; includes Hyperdrive pooling; Cron Triggers for background jobs |
| Vercel Hobby | $0 | Terms restrict Hobby to personal, non-commercial use; not appropriate for an organisation |

## Decision

- **Database:** Neon Postgres, Free plan, AWS Frankfurt (EU) region. Move to the Launch plan if limits are reached.
- **Application:** Next.js on Cloudflare Workers through the OpenNext adapter (`@opennextjs/cloudflare`), Workers Paid plan ($5/month).
- **Database connection:** Cloudflare Hyperdrive with node-postgres and Drizzle, so interactive transactions work (approval must be atomic). **Hyperdrive query caching is disabled** for this database; the review queue and statuses must never be stale.
- **Placement:** Smart Placement enabled, so the Worker runs near the database rather than near the user, avoiding several Kenya–Frankfurt round trips per page.
- **Background jobs:** Cloudflare Cron Triggers replace pg-boss. *Amended 24 Nov 2026:* SMS is sent immediately after each write, with retries through a Cloudflare Queue (included in Workers Paid), and all purges and retention run daily. The original "dispatch every minute, purges hourly" would keep Neon's compute awake all month (about 180 CU-hours, beyond the Free plan's 100). See `database-design.md` §6.
- **Backups:** Neon's built-in restore history, plus a nightly encrypted `pg_dump` (GitHub Actions, encrypted with `age`) stored in Cloudflare R2. A restore drill before go-live and monthly after.
- **Errors:** Sentry (Cloudflare SDK) with personal data stripped.

Expected running cost: Cloudflare Workers Paid $5/month, Neon (Free, or a few dollars a month on Launch; see the amendment below), plus SMS.

## Consequences

1. **Explicit consent for storage outside Kenya.** Registration (self and assisted) adds a separate, unticked-by-default consent: the member agrees that their details will be stored securely on servers in the European Union. It is recorded with the privacy-notice version. A member who declines cannot be added to the online registry; the office keeps their details on paper.
2. **ODPC confirmation of safeguards.** The church must obtain the Data Commissioner's confirmation of appropriate safeguards for this transfer. This is added to the go/no-go list. The church should take advice on whether registration can open before confirmation is received; that decision belongs to the church, not the developers.
3. **Data processing agreements** with Neon and Cloudflare are accepted in the church's accounts and filed.
4. The EU region is chosen deliberately: GDPR is a strong argument for "commensurate data protection law" in the safeguards assessment.
5. Code stays portable. Business logic lives in `src/modules/*`; Workers-specific code is confined to the adapter and job entry points. If the church later moves to Kenyan hosting, only deployment changes.
6. Kamal and Docker deployment are dropped from the plan. Deployment is `wrangler deploy` from GitHub Actions, with versioned rollbacks through Cloudflare.

## Amendment — 24 November 2026: Neon environments, plan and local development

Confirms the hosting decision (Neon in the EU; no Kenyan hosting providers) and adds how environments are set up. Items marked **decision needed** are for the church, not the developers.

### Environments

| Environment | Where | Data |
|---|---|---|
| Production | Neon project `ack-production`, AWS Frankfurt; Worker env `production` on `ackemmanuelfreretown.org` and `admin.ackemmanuelfreretown.org` | Real members |
| Staging | Separate Neon project `ack-nonprod`, branch `staging`; Worker env `staging` on `staging.ackemmanuelfreretown.org` and `admin-staging.ackemmanuelfreretown.org` (one level deep, so Cloudflare's free certificate covers them) | Synthetic only |
| Development | `ack-nonprod`, one branch per developer, or any local Postgres | Synthetic only |
| CI | A disposable Postgres 17 service container on the GitHub runner | Created and destroyed per run |

- **Never branch production into staging or development.** A Neon branch copies all data, so a staging branch made from production would put real members' religious affiliation in a less protected place. Non-production lives in a separate Neon project with separate credentials and only synthetic data.
- **Docker is not needed on anyone's machine.** Developers use their Neon development branch (or an existing local Postgres). CI's Postgres runs inside GitHub's runner.
- Each environment has its own Hyperdrive config, created with caching disabled.
- Before every production migration, the deploy pipeline creates a Neon restore branch of production (kept 7 days) so a bad migration can be undone by restoring it.

### Plan — decided 24 November 2026 (requirements D26)

Neon's Free plan keeps only **6 hours** of restore history (capped at 1 GB of changes). A mistake noticed the next morning could not be undone from history, only from the previous night's `pg_dump`, losing up to a day of registrations. The Launch plan keeps up to **7 days**, is usage-based with no monthly minimum (compute about $0.106 per CU-hour, storage about $0.35 per GB-month, instant-restore history about $0.20 per GB-month), and scales to zero when idle.

Decision: **production on Launch with a 7-day restore window; non-production on Free.** For about 600 members with idle periods, expect a few dollars a month for the database (an estimate; confirm on the Neon usage page after the first month). NFR-7 asks for point-in-time recovery, which the Free plan provides only for 6 hours.

### Vendor risk

Databricks announced it would acquire Neon in May 2025. The exit path is unchanged: Neon is standard PostgreSQL 17, the nightly encrypted `pg_dump` in R2 can be restored to any Postgres provider, and the application only needs a new connection string in Hyperdrive.
