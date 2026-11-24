Closes #

## What and why

<!-- One pull request per issue. What changed, and why this way. -->

## How it was tested

<!-- Commands run, journeys checked, viewports and languages tried. -->

## Checklist (CLAUDE.md "Testing and done")

- [ ] `pnpm check` passes (types, lint, dependency rules, formatting, unit tests)
- [ ] Unit tests cover the business rules touched (name the BR-/FR- IDs)
- [ ] Integration tests run against real Postgres (`pnpm test:integration`)
- [ ] An authorisation test exists for every role/action pair added
- [ ] Every state change writes an audit entry in the same transaction
- [ ] No personal data in logs, errors, analytics or URLs
- [ ] Member-facing text is in `messages/en.json` and `messages/sw.json`
- [ ] Migrations generated with `pnpm db:generate` / `db:custom`, reviewed, committed; new tables have grants
- [ ] Docs updated if behaviour or a decision changed (requirements, domain model, database design, ADR)
- [ ] New dependencies are pinned and justified below

## New dependencies

<!-- Package, version, and why it is needed. "None" if none. -->
