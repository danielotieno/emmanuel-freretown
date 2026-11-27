# Documentation

| Document | What it covers |
|---|---|
| [product/requirements.md](product/requirements.md) | Release 1 requirements: decisions, roles, business rules, functional and non-functional requirements, go/no-go |
| [architecture/domain-model.md](architecture/domain-model.md) | Modules, entities, invariants, lifecycles; elections design (Release 2) |
| [architecture/database-design.md](architecture/database-design.md) | Tables, constraints, privileges, seeds and jobs — source of truth for the schema |
| [architecture/adr/](architecture/adr/) | Architecture decision records: [0001 web framework](architecture/adr/0001-web-framework.md), [0002 hosting](architecture/adr/0002-hosting.md), [0003 ORM](architecture/adr/0003-orm-and-database-access.md) |
| [compliance/dpia.md](compliance/dpia.md) | Data Protection Impact Assessment for the registry (draft for the Vicar) |
| [compliance/breach-response.md](compliance/breach-response.md) | What to do, and by when, if personal data is breached |
| [compliance/retention-schedule.md](compliance/retention-schedule.md) | Every place personal data lives, how long it is kept, and what removes it |
| [compliance/data-subject-requests.md](compliance/data-subject-requests.md) | How the church office handles a member's request to see, correct or delete their data |
| [compliance/go-live.md](compliance/go-live.md) | Tracker for the go-live paperwork: registrations, agreements, accounts, owners |
| [operations/environments.md](operations/environments.md) | Setting up Neon, Hyperdrive, domains, Cloudflare Access and secrets; the app's database login |
| [operations/observability.md](operations/observability.md) | Logging, request ids, safe database errors, Sentry and Workers Logs, with personal data kept out |
| [operations/backups-and-rollback.md](operations/backups-and-rollback.md) | Deploy pipeline, rollback, nightly encrypted backups, drift check and restore drill |
| [design/references/](design/references/) | Diocese crest scan (placeholder) and brand palette |

Repository root: `CLAUDE.md` (rules for Claude Code), `CONTEXT.md` (domain language), `PRODUCT.md` (audience and design intent), `DESIGN.md` (visual system).

Keep these documents in step with the code. When a decision changes, update the document in the same pull request, or add a new ADR.
