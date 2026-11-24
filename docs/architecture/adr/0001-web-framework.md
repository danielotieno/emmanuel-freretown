# ADR 0001: Web framework — Next.js (App Router)

| | |
|---|---|
| Status | Accepted. Hosting and deployment parts superseded by ADR 0002 |
| Date | 24 November 2026 |
| Decided by | Danny (technical lead) |

## Context

The platform needs one full-stack React framework for the public registration pages, the officer desk and the admin portal. The initial preference was TanStack Start (stable 1.0 since October 2026). The main concern raised in review was long-term maintainability: the church will depend on volunteers or future hires in Mombasa, and the pool of developers who know a framework matters as much as its technical merits. The build deadline (26 November) also favours the framework the team can move fastest in.

## Options considered

1. **TanStack Start.** Excellent type safety and a simple server model; newer, with a smaller community and hiring pool.
2. **Next.js (App Router).** The largest React framework community and hiring pool, mature self-hosting with standalone output, broad library support (Better Auth, Paraglide, Drizzle all support it). More framework complexity: caching behaviour, server/client component boundaries, middleware.
3. **React Router (framework mode).** Simple and mature, but no advantage over the other two for this team.

## Decision

Use Next.js with the App Router.

*Amended 24 November 2026:* the original decision also said "self-hosted as a standalone Node build in Docker on Kenyan servers". Hosting is now Cloudflare Workers with Neon Postgres in the EU (ADR 0002); there is no Docker or Kenyan server in the plan.

## Consequences

- Business logic stays in `src/modules/*` and does not import from `next`. Server actions and route handlers are thin adapters that validate input, call a module function, and return a result. A lint rule enforces this, so a future framework change touches only the adapters.
- **Authorisation is enforced in module functions and server actions, never only in middleware.** Middleware may redirect for convenience but is not a security boundary. (Next.js has had a vulnerability that allowed middleware to be skipped.)
- Next.js and React security releases are applied within 48 hours; Dependabot alerts go to two maintainers.
- Data that must be fresh (review queue, statuses) is fetched with caching disabled; caching is opted into deliberately, never assumed.
- Public pages keep client components to a minimum to stay within the 200 KB budget (NFR-2).
- Public site and admin portal are served from the same app; the admin subdomain is routed by host, with its own host-only session cookie.
- Unchanged by this decision: TypeScript strict, PostgreSQL, Zod, Better Auth, Paraglide, Tailwind, shadcn/ui. (pg-boss, Kamal deployment and Kenyan hosting were replaced by ADR 0002; the ORM is decided in ADR 0003.)
