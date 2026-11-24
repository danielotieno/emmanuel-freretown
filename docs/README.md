# Documentation

| Document | What it covers |
|---|---|
| [product/requirements.md](product/requirements.md) | Release 1 requirements: decisions, roles, business rules, functional and non-functional requirements, go/no-go |
| [architecture/domain-model.md](architecture/domain-model.md) | Modules, entities, invariants, lifecycles; elections design (Release 2) |
| [architecture/database-design.md](architecture/database-design.md) | Tables, constraints, privileges, seeds and jobs — source of truth for the schema |
| [architecture/adr/](architecture/adr/) | Architecture decision records: [0001 web framework](architecture/adr/0001-web-framework.md), [0002 hosting](architecture/adr/0002-hosting.md), [0003 ORM (proposed)](architecture/adr/0003-orm-and-database-access.md) |
| [design/references/](design/references/) | Diocese crest scan (placeholder) and brand palette |

Repository root: `CLAUDE.md` (rules for Claude Code), `CONTEXT.md` (domain language), `PRODUCT.md` (audience and design intent), `DESIGN.md` (visual system).

Keep these documents in step with the code. When a decision changes, update the document in the same pull request, or add a new ADR.
