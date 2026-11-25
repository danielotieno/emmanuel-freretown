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
| 6 | Church-owned accounts created with a church email held by the Vicar; technical lead invited as administrator | Vicar, technical lead | Not started | D40: GitHub, Mobile Sasa (D43), Sentry. Neon and Cloudflare are in the technical lead's personal accounts, shared with the church email |
| 7 | Data processing agreement accepted: Neon | Technical lead (account owner), on the parish's behalf | Not started | Go/no-go item 9 |
| 8 | Data processing agreement accepted: Cloudflare | Technical lead (account owner), on the parish's behalf | Not started | Go/no-go item 9 |
| 9 | Data processing agreement accepted: Mobile Sasa | Vicar (account owner) | Not started | Go/no-go item 9 |
| 10 | Data processing agreement accepted: Sentry | Vicar (account owner) | Not started | Go/no-go item 9; confirm the data region |
| 11 | Data processing agreement accepted: GitHub | Vicar (account owner) | Not started | Go/no-go item 9; backups run on its runners (#8) |
| 12 | Each agreement checked: vendor notifies breaches within 48 hours where practicable (s. 43(3)) | Technical lead | Not started | Notices go to each account's email, which may be the technical lead's (D40, amended); the technical lead passes them to the Vicar at once |
| 13 | Mobile Sasa account opened under the church email and full access requested (business registration document) for the shared `MOBILESASA` sender | Technical lead | Not started | D43. Approval usually the same day; OTP depends on it (go/no-go item 4). Our own sender ID is optional and can follow later |
| 14 | Privacy notice owner named | Vicar | Done | The Vicar owns and approves it (D39). Writing it is #27 |
| 15 | Kiswahili reviewer named | Committee | Not needed | Kiswahili is optional (D44); a review (#29) can follow go-live |
| 16 | Breach contact named and procedure adopted | Vicar | In progress | Vicar, with the technical lead first (D42). Procedure in `docs/compliance/breach-response.md`; deputy still to be named |
| 17 | Two Super Administrators named | Committee | In progress | The technical lead and one committee member who is not the Secretary or a Warden (D40); committee member still to be named |
| 18 | Privacy notice published at `/privacy` and its version recorded on registrations | Vicar (approves), technical lead | Not started | #27. Raise `PRIVACY_NOTICE_VERSION` (registration module) from `2026-11-draft` when the approved notice is published: every revision records it (BR-15). Registration must not open before this |
| 19 | Turnstile widgets created for staging and production | Technical lead | Not started | `TURNSTILE_SITE_KEY` var in `wrangler.jsonc` and `TURNSTILE_SECRET_KEY` secret per environment (docs/operations/environments.md). Without them the form shows the "register at the church office" message and nobody can get a code |
