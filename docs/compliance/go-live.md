# Go-live paperwork tracker

The non-code work that registration depends on (issue #5, requirements §10). Update the status here as each item is done. Signed documents, correspondence and contact details go in the parish's records, **not** in this repository; this page only says where they are.

Status: `Not started` · `In progress` · `Done` · `Waived` (with the decision recorded).

| # | Item | Owner | Status | Evidence / notes |
|---|---|---|---|---|
| 1 | Data controller named | Vicar | Done | The parish (D23), as "ACK Emmanuel Freretown - Kengeleni"; the Vicar confirmed the name matches the parish's registration (25 Nov 2026, #65). Use it on the DPIA and the ODPC registration |
| 2 | ODPC registration as data controller submitted | Vicar | Not started | Go/no-go item 2 |
| 3 | DPIA completed, signed by the Vicar and submitted to the ODPC | Vicar, drafted by the technical lead | In progress | Draft in `docs/compliance/dpia.md` (D41). **s. 31(5): submit sixty days before processing; see Q28** |
| 4 | Decision on the sixty-day DPIA rule and the registration date (Q28) | Vicar, on legal advice | Not started | Needed before registration opens |
| 5 | ODPC confirmation of safeguards for storage outside Kenya, or the Vicar's documented decision to proceed while it is pending | Vicar | Not started | ADR 0002, go/no-go item 10 |
| 6 | The church email has access to every vendor account (D40, amended 25 Nov 2026, #78) | Technical lead | In progress | The accounts may be in the technical lead's name (GitHub, Mobile Sasa, Sentry, Neon, Cloudflare) provided the church email has access: GitHub owner or admin on the repository, Mobile Sasa team member, Sentry organisation owner, Neon collaborator, Cloudflare account member. Tick each when granted |
| 7 | Data processing agreement accepted: Neon | Technical lead (account owner), on the parish's behalf | Done | 25 Nov 2026. Applies through Neon's terms (its product schedule, under Databricks' agreement and DPA); no separate acceptance step |
| 8 | Data processing agreement accepted: Cloudflare | Technical lead (account owner), on the parish's behalf | Done, with a gap | Applies automatically through the Self-Serve Subscription Agreement (§6.1). **Its DPA covers only personal data of people in Europe and California, not Kenyan members**: for the Vicar's legal advice with item 5 (go/no-go item 10) |
| 9 | Data processing agreement accepted: Mobile Sasa | Technical lead | Terms accepted | 25 Nov 2026. Mobile Sasa publishes no separate DPA; its terms and privacy policy say it processes customers' data only to provide the service. Ask for a DPA (info@bitwise.co.ke) if legal advice requires one |
| 10 | Data processing agreement accepted: Sentry | Technical lead | Done | 25 Nov 2026, accepted electronically. EU (Frankfurt) data region (docs/operations/observability.md) |
| 11 | Data processing agreement accepted: GitHub | Technical lead | Not done | The repository is in the technical lead's personal GitHub account; no separate DPA accepted. GitHub's DPA is part of the GitHub Customer Agreement; check how it applies to the account. Backups run on its runners (#8) |
| 12 | Each agreement checked: vendor notifies breaches within 48 hours where practicable (s. 43(3)) | Technical lead | Not started | Notifications go to the church account email; someone must watch it |
| 13 | Mobile Sasa account opened under the church email and full access requested (business registration document) for the shared `MOBILESASA` sender | Technical lead | Partly done | Full access approved and the shared `MOBILESASA` sender in use (D43). The account is under the technical lead's personal email, not the church's (see item 6) |
| 14 | Privacy notice owner named | Vicar | Done | The Vicar owns and approves it (D39). Writing it is #27 |
| 15 | Kiswahili reviewer named | Committee | Not needed | Kiswahili is optional (D44); a review (#29) can follow go-live |
| 16 | Breach contact named and procedure adopted | Vicar | In progress | Vicar, with the technical lead first (D42). Procedure in `docs/compliance/breach-response.md`; deputy still to be named |
| 17 | Two Super Administrators named | Committee | In progress | The technical lead and one committee member who is not the Secretary or a Warden (D40); committee member still to be named |
| 18 | Privacy notice published at `/privacy` and its version recorded on registrations | Vicar (approves), technical lead | In progress | #27: `/privacy`, `/terms` and `/cookies`, version `2026-11-25`, approved by the Vicar (25 Nov 2026). Done once #27 is merged and deployed. Change `PRIVACY_NOTICE_VERSION` (registration module) whenever the notice changes: every revision records it (BR-15). Registration must not open before this |
| 19 | Turnstile widgets created for staging and production | Technical lead | Done once #76 is deployed | Widgets created (one per hostname, Managed mode) and `TURNSTILE_SECRET_KEY` set in both environments (25 Nov 2026); site keys in `wrangler.jsonc` (#76). Check `/registration` on staging shows the widget |
