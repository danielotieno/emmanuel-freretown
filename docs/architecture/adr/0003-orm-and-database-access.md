# ADR 0003: ORM and database access — Drizzle ORM

| | |
|---|---|
| Status | Accepted (24 November 2026). Drizzle ORM, pinned to 0.45.x for Release 1 and the December pilot |
| Date | 24 November 2026 |
| Proposed by | Claude (review for Danny, technical lead) |
| Decided by | Danny (technical lead). The recommendation and its four assumptions were accepted as written |
| Related | ADR 0001 (framework), ADR 0002 (hosting), `docs/architecture/database-design.md` |

## Context

The platform stores a sensitive registry (religious affiliation) and, in Release 2, secret ballots. Its integrity rules are unusually database-heavy:

- exclusion constraints so HBC and department periods never overlap (`EXCLUDE USING gist … tstzrange`);
- partial unique indexes (one phone per active or inactive member; one open HBC period; one active role grant, with `NULLS NOT DISTINCT`);
- about 40 `CHECK` constraints that encode BR-01, BR-06, BR-08, BR-15 and the registration state machine;
- column privileges for `app_runtime` (append-only audit log, immutable revisions);
- a `SECURITY DEFINER` function for retention redaction (BR-14);
- in Release 2, atomic "participation + ballot" writes and a race between a manual check-in and an online vote.

The application runs on Cloudflare Workers through OpenNext, connects to Neon through Hyperdrive (ADR 0002), and must be maintainable by volunteers or future hires in Mombasa.

The setup branch already contains a Drizzle schema written before this evaluation. Its SQL migrations (`src/db/migrations/*.sql`) are plain PostgreSQL and would carry over to either option as a baseline. That prior work is not a reason to choose Drizzle; this ADR evaluates both on their merits.

Versions evaluated (npm, 24 November 2026): Drizzle ORM 0.45.4 stable, with 1.0 at release candidate 6; Prisma ORM 7.10.1 stable, with 8.0 at release candidate.

## A distinction that matters more than the ORM

| Layer | What it protects against | Where it lives here |
|---|---|---|
| **ORM type safety** | Developer mistakes at compile time: a misspelled column, a wrong type, a missing field | Drizzle or Prisma |
| **Database integrity** | Invalid data from *any* path: a bug, a race between two officers, a manual fix in the console, a future script | `CHECK`, unique, exclusion and foreign-key constraints; transactions |
| **Application security** | The wrong person doing something: an officer approving their own capture (BR-10), the public learning an FWO exists | Authorisation in module functions and server actions; database grants; rate limits |

Neither ORM provides the second or third row. A fully type-safe query can still approve a registration twice under a race, and a perfectly typed endpoint can still leak data. **Whichever ORM we pick, integrity stays in PostgreSQL and authorisation stays in `src/modules/*`.** The question is which ORM makes those layers easiest to express, review and keep correct.

## Evaluation

### 1. Schema design and maintainability

| | Drizzle | Prisma |
|---|---|---|
| Schema language | TypeScript (`pgTable`), close to SQL | Prisma Schema Language (PSL), its own DSL |
| `CHECK` constraints | In the schema (`check()`), generated into migrations | Not in the schema; hand-written SQL only. The Prisma v7 feature matrix lists CHECK as "not yet" for schema and Migrate |
| Partial indexes | In the schema (`.where(sql…)`) | Preview feature since 7.4 (`partialIndexes`) |
| Expression indexes (`lower(name)`) | In the schema | Hand-written SQL |
| Exclusion constraints, `NULLS NOT DISTINCT` partial index, functions, grants | Hand-written SQL migration | Hand-written SQL migration |
| Where a reader sees the rules | ~90% in `src/db/schema/*.ts`, the rest in 3 SQL files | Relations and columns in `schema.prisma`; most of our rules in SQL files that the schema does not mention |

For this platform, the rules *are* the schema. With Prisma, a reader of `schema.prisma` would not see BR-15 (`transfer_consent` must be true) or the registration state checks; they would live only in migration SQL, invisible to Prisma's diffing. With Drizzle they sit beside the column they constrain.

### 2. Type safety and developer experience

Both give end-to-end inferred types. Prisma's generated client has the most polished autocomplete and nested-write ergonomics, and its errors are friendlier for newcomers. Drizzle infers types directly from the schema with no generate step, and its query builder reads like SQL, so what you write is what runs. Prisma requires `prisma generate` after every schema change (a frequent source of "stale client" confusion); Drizzle does not.

### 3. Complex relational queries and transactions

Our hardest operations, written both ways:

**Approval (FR-4): optimistic concurrency, member creation, HBC period, departments, audit — one transaction.**

```ts
// Drizzle
await db.transaction(async (tx) => {
  const [m] = await tx.insert(member).values({ ...fromRevision, sourceRegistrationId: id }).returning();
  const [reg] = await tx.update(registration)
    .set({ status: "APPROVED", memberId: m.id, decidedAt: now,
           version: sql`${registration.version} + 1` })
    .where(and(eq(registration.id, id), eq(registration.version, expectedVersion),
               eq(registration.status, "SUBMITTED")))
    .returning();
  if (!reg) throw new ConflictError();            // someone else acted first: whole tx rolls back
  await tx.insert(memberHbcAssignment).values({ memberId: m.id, hbcId });
  if (deptIds.length) await tx.insert(departmentMembership)
    .values(deptIds.map((d) => ({ memberId: m.id, departmentId: d, state: "DECLARED" as const })));
  await audit.write(tx, { action: "registration.approve", entityType: "registration", entityId: id, actor });
});
```

```ts
// Prisma
await prisma.$transaction(async (tx) => {
  const m = await tx.member.create({ data: { ...fromRevision, sourceRegistrationId: id,
    hbcAssignments: { create: { hbcId } },
    departmentMemberships: { create: deptIds.map((d) => ({ departmentId: d, state: "DECLARED" })) } } });
  const { count } = await tx.registration.updateMany({
    where: { id, version: expectedVersion, status: "SUBMITTED" },
    data: { status: "APPROVED", memberId: m.id, decidedAt: now, version: { increment: 1 } },
  });
  if (count === 0) throw new ConflictError();
  await audit.write(tx, { /* … */ });
});
```

Both are fine. Prisma's nested create is shorter. In both, the member is created first because the CHECK `(status = 'APPROVED') = (member_id IS NOT NULL)` must hold after every statement; the database rejects any order that breaks it, whichever ORM issued it.

**HBC transfer (FR-6) and history.** Close the open period and open a new one at the same instant; the exclusion constraint rejects overlaps from any path.

```ts
// Drizzle
await tx.update(memberHbcAssignment).set({ validTo: at })
  .where(and(eq(memberHbcAssignment.memberId, memberId), isNull(memberHbcAssignment.validTo)));
await tx.insert(memberHbcAssignment).values({ memberId, hbcId: newHbcId, validFrom: at });
```

Prisma is equivalent (`updateMany` + `create`). Neither ORM can express "who was in Judea on 10 January" with a range operator; both need SQL: Drizzle as a typed `sql` fragment inside a normal query (`sql\`tstzrange(${t.validFrom}, ${t.validTo}) @> ${date}::timestamptz\``), Prisma as `$queryRaw` or TypedSQL, which returns results outside the normal query API.

**Multiple department memberships.** Plain one-to-many in both. The "at most one open membership per department" rule is an exclusion constraint in SQL for both.

**Election eligibility (D22, Release 2).** "Active members of HBC X whose registration was approved before nominations opened, with their HBC at that date": a join across `member`, `registration` and a range-contains on `member_hbc_assignment`. Drizzle composes this in the query builder with one `sql` fragment and keeps the result typed. Prisma needs `$queryRaw`/TypedSQL for the range predicate.

**Voting (Release 2): participation and ballot in one transaction, racing a manual check-in.**

```ts
// Drizzle
await db.transaction(async (tx) => {
  await tx.insert(voterParticipation).values({ electionId, memberId, channel: "ONLINE" });
  // unique (election_id, member_id) makes a concurrent check-in or second vote fail here
  await tx.insert(ballot).values({ electionId, sealed });   // no member reference, no timestamp
}, { isolationLevel: "serializable" });
```

Prisma supports the same with `isolationLevel: Serializable`. Where row locks are needed (`SELECT … FOR UPDATE` on the electorate entry), Drizzle has `.for("update")`; Prisma has no lock clause in its query API and needs `$queryRaw`.

**Audit logging.** Both write the audit entry explicitly inside the transaction (rule 4). Prisma offers client extensions that could audit "automatically"; we should not use that pattern either way, because implicit audit is easy to bypass and hard to review.

### 4. PostgreSQL-specific capabilities

| Capability | Drizzle | Prisma |
|---|---|---|
| CHECK | Schema | SQL only |
| Partial / expression indexes | Schema | Preview / SQL |
| Exclusion constraints | SQL | SQL |
| Triggers, functions | SQL | SQL |
| Row-level security | Schema support for policies and roles (`pgPolicy`, `pgRole`, `.enableRLS()`) | SQL only |
| Range types (`tstzrange`) | `sql` fragments, typed results | Unsupported type; raw queries |
| `SELECT … FOR UPDATE / SKIP LOCKED` (SMS outbox dispatch) | Query builder | Raw SQL |

We do not plan row-level security in Release 1 (authorisation is in modules; grants restrict the runtime role). If HBC-scoped coordinators arrive in Release 2, RLS with `SET LOCAL` inside a transaction is viable with either, and easier to keep in the schema with Drizzle.

### 5. Migrations, drift, rollback and production safety

| | Drizzle Kit | Prisma Migrate |
|---|---|---|
| Generation | `generate` diffs the TS schema against the last snapshot; SQL files committed | `migrate dev` diffs against a shadow database; SQL files committed |
| Custom SQL | `generate --custom` creates an empty file in sequence | Edit a generated migration or create one with `--create-only` |
| Applying in production | `migrate` (applies pending files, records hashes) | `migrate deploy` |
| Drift vs migrations | CI regenerates and fails on a diff (already in our CI) | `migrate diff --exit-code` |
| Drift vs a live database | No built-in command | `migrate diff` from the live database to the schema — but blind to CHECK constraints, exclusions and grants, which are most of our rules |
| Down migrations | None | None (generate a reverse diff by hand) |

Neither tool gives safe automatic rollback, and neither sees our most important constraints when checking drift. So the production-safety plan is the same for both, and independent of the ORM:

1. **Forward-only migrations** in expand/contract steps (add the new thing, migrate data, remove the old thing in a later release).
2. **A Neon branch as the restore point** created automatically just before `migrate` runs in production; rollback means pointing Hyperdrive back at that branch or restoring from history (ADR 0002).
3. **A catalog drift check**: weekly, compare `pg_dump --schema-only` of production with a database freshly built from the committed migrations. This catches CHECKs, exclusions, functions and grants that both ORMs ignore.
4. Migrations run in CI against real Postgres on every pull request (already in place).

Prisma's shadow-database drift detection is a real advantage in development, but it does not cover what matters most here.

### 6. Neon, pooling and serverless (Cloudflare Workers)

Both work with `pg` over Hyperdrive and must create a client per request (Workers forbids sharing a connection across requests).

- **Drizzle:** a thin layer over `pg`; no engine, no WASM, small bundle. Running on Workers today in this repository (tested in workerd on 24 November 2026).
- **Prisma 7:** requires a driver adapter (`@prisma/adapter-pg`) and ships a WASM query compiler. It is documented for Workers and Hyperdrive, but WASM loading through bundlers has had issues on workerd (for example prisma/orm#28657, "Wasm code generation disallowed by embedder"). Our bundle goes through Next.js and OpenNext, adding a second bundler to that path. This is a real, testable risk, not a blocker.

### 7. Testing, observability and debugging

- **Testing:** identical. Both run against real Postgres in CI; neither should be mocked.
- **Observability:** Prisma is stronger: built-in tracing (`@prisma/instrumentation`, OpenTelemetry) and query events. Drizzle has a `logger` hook; tracing comes from `pg` instrumentation. **For both, query logging must never include parameters in production** (rule 2: names, phones, FWOs).
- **Debugging:** Drizzle's SQL is what you wrote, which makes slow queries and constraint errors easy to trace. Prisma's generated SQL is less predictable (for example, nested writes become several statements).

### 8. Long-term maintenance and onboarding

- Prisma is better known: more tutorials, more developers have used it, and PSL is easy to read for someone who does not know SQL.
- Drizzle needs someone who can read SQL. That person is needed anyway: about half our integrity rules are hand-written SQL in either option, and the elections design depends on transaction semantics.
- **Churn risk on both sides.** Drizzle's next major (1.0, at RC) restructures the migrations folder (`drizzle-kit up` converts it) and changes casing and relational-query APIs. Prisma's next major (8.0) is also at RC. Pin versions (done) and upgrade deliberately, never in the run-up to registration or an election.

### 9. Ecosystem maturity and lock-in

- **Prisma:** mature, venture-backed company whose business is increasingly its hosted database (Prisma Postgres). PSL is proprietary; leaving means rewriting the schema and every query.
- **Drizzle:** younger, open source, smaller team; still pre-1.0. The schema is TypeScript over plain SQL; leaving means rewriting queries, but the migrations and the SQL mental model carry over to anything.
- **Both** are supported by Better Auth's adapters, so staff authentication does not force the choice.

## Strengths, weaknesses and operational risks

| | Strengths | Weaknesses | Operational risks |
|---|---|---|---|
| **Drizzle** | Most of our constraints live in the schema; SQL-transparent; tiny bundle, proven here on Workers; typed range and lock queries without raw SQL | Pre-1.0 with a breaking 1.0 coming; smaller community; needs SQL literacy; weaker built-in tracing | 1.0 upgrade touches migrations folder and query APIs; no live-DB drift check |
| **Prisma** | Best DX for newcomers; large community; strong tracing; shadow-DB drift checks in development | CHECK constraints, expression indexes, ranges and locks fall outside the schema and query API; generate step; heavier runtime | WASM query compiler through Next.js + OpenNext on workerd needs proving; drift checks blind to our core constraints; DSL lock-in |

## Recommendation

**Adopt Drizzle ORM, pinned to 0.45.x for Release 1 and the December pilot.** Plan the 1.0 upgrade as its own issue after the January 2027 elections, once 1.0 is stable.

Why it is the better long-term decision for this platform: our correctness depends on PostgreSQL features (checks, partial and exclusion constraints, ranges, locks, grants). Drizzle keeps most of them visible in typed schema code next to the columns they protect, and expresses the rest of our queries without dropping to untyped raw SQL. Prisma's main advantages (onboarding ergonomics, drift checks) do not reach the parts of this system that carry the risk, and it adds a WASM runtime to an already adapter-heavy Workers deployment.

### Assumptions this rests on

1. **At least one maintainer can read SQL.** If the long-term team will be people who know Prisma but not SQL, Prisma's onboarding advantage grows — but the hand-written SQL migrations would still need that skill.
2. **We stay on Cloudflare Workers (ADR 0002).** On a plain Node host, Prisma's runtime risk largely disappears and the comparison narrows to points 1, 3 and 4.
3. **Drizzle 1.0 ships with a supported upgrade path** (`drizzle-kit up`). If the project stalled, the SQL migrations and the schema shape would carry to another tool; the queries would need rewriting.
4. **Integrity stays in the database** regardless of ORM: every rule in `database-design.md` is enforced by a constraint, grant or function, with integration tests against real Postgres.

## Consequences

- The existing Drizzle schema and migrations stay; `database-design.md` remains the source of truth.
- Add a catalog drift check (`pg_dump --schema-only` comparison against a database built from the committed migrations). Tracked in #8.
- Production migrations create a Neon restore branch first. Tracked in #7.
- Query logging with parameters is never enabled outside local development.
- The Drizzle 1.0 upgrade after January 2027 is tracked in #37.

## If this decision is revisited

Not chosen; kept for the record. To move to Prisma: keep the SQL migrations as a baseline (`prisma migrate resolve --applied`), introspect to `schema.prisma`, replace `src/db/schema` and the Better Auth adapter, and prove the Prisma 7 client in workerd through OpenNext before any feature work.
