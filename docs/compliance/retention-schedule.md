# Retention schedule

| | |
|---|---|
| Status | v1, 27 Nov 2026 (#26) |
| Owner | The Vicar (data protection in the parish); the technical lead keeps it current |
| Promised to members in | The privacy notice, "How long we keep it" (`messages/en.json`, `privacy_keep_body`) |
| Decisions | BR-14 (D13), D45 (Q13), D51–D53 (elections, Release 2), D26 (backups) |

Every place the platform holds personal data, how long it stays, and what removes it. "Removed" means the values are deleted or overwritten in place; a record of the decision (status, dates, reasons, FWO number) stays, as CONTEXT.md's "Avoid: delete" says. Daily jobs run at 04:00 in Mombasa (`src/jobs/daily.ts`, database-design.md §6); a job that fails is reported to Sentry, and the next night's run picks up what was missed.

When a period or a place changes, update this file, the privacy notice (with a new version) and the DPIA together.

## The register (Neon, Frankfurt)

| Data | Where | Kept | Removed by |
|---|---|---|---|
| A member's name, phone number and department memberships | `member`, `department_membership` | While they are a member. One year after they are marked deceased or transferred out, removed (D45) | `retention.redact_members` → `redact_closed_member()`. The year counts from the `member.change_status` audit entry that closed the record |
| A member's FWO number, status, status reason, SMS language, HBC history, dates | `member`, `member_hbc_assignment` | Permanently. The FWO number stays so it is never issued again (D2, BR-02), no longer linked to a name after D45 | Never |
| A registration's details (name, FWO, phone, HBC, departments) | `registration_revision`, `registration_revision_department`, `verification_evidence` (phone) | Rejected or withdrawn: 12 months after the decision (BR-14). Approved: as the member's record, removed with it (D45; the FWO number and HBC stay, as on the member) | `retention.redact` → `redact_expired_registration()`; `retention.redact_members` for approved ones |
| A registration's reference, channel, status, dates; decision reasons | `registration`, `registration_decision` | Permanently. Staff are told not to write names or numbers in reasons | Never |
| Audit entries | `audit_entry` | Permanently, append-only (FR-11). Personal values in `before`/`after` are removed with the record they are about: all values for a registration under BR-14; the name, phone and departments for a member under D45, keeping reasons and statuses | The two retention functions above; the application cannot change or delete an entry |
| One-time codes and their verification tokens | `phone_challenge` | 24 hours (the notice says "within two days": the job runs daily). Stored only as HMACs | `otp.purge` |
| Rate-limit counters (phone and IP) | `rate_limit_bucket` | 1 day. Keys are HMACs, never readable numbers or addresses | `ratelimit.purge` |
| SMS sent: phone number, template and parameters (reference and status only, FR-8) | `sms_outbox` | 90 days | `sms.purge` |
| Imports of the parish list | `member_import` | Permanently: counts, consent confirmation and the administrator. No member's details | Never |
| Election records (Release 2) | — | Electorate and participation: one week after the final result (D51). Nominations: two weeks (D52). Turnout counts: permanently (D53). Office-holders: permanently (D52) | #121, not built yet |

## Staff accounts (Neon)

Staff are people too: their names, emails and IP addresses are personal data.

| Data | Where | Kept | Removed by |
|---|---|---|---|
| Name, email, roles | `user`, `role_assignment` | While they are staff. Disabled accounts keep the row, because audit entries name them | Never (a disabled account keeps no way to sign in) |
| Password hash, authenticator secret, backup codes | `account`, `two_factor` | While the account exists. Never readable by `readonly_ops` | With the account |
| Sessions (IP address, browser) | `session` | 24 hours at most (Better Auth's expiry); idle timeouts of 30 minutes or 4 hours end use earlier (D32) | `session.purge` once expired; an idle-timed-out session is also deleted when next used |
| Sign-in verification values | `verification` | Until they expire | `session.purge` |
| Sign-in rate-limit counters (key = IP and path) | `staff_rate_limit` | 1 day after the last request | `session.purge` |

## Outside the register

| Place | What | Kept | Notes |
|---|---|---|---|
| Neon point-in-time history | Every change to the database | 7 days (the restore window, D26) | Neon project setting (`environments.md`). Pre-deploy restore branches: 7 days |
| Backups (Cloudflare R2, EU) | Encrypted nightly dumps | 35 days | Lifecycle rule `expire-35-days` (`backups-and-rollback.md`). A removal under BR-14 or D45 is therefore gone from every backup 35 days later |
| GitHub Actions (backup job) | The dump passes through the runner and is encrypted there | Not stored | `backups-and-rollback.md` |
| Cloudflare Workers logs | Request lines and structured log lines: ids, counts and outcomes, never names, phones, FWO numbers or codes (CLAUDE.md rule 2) | 3 days on Workers Free, 7 on Workers Paid | Set by the plan (`observability.md`); the notice says "up to 7 days" |
| Sentry (EU) | Error events with request data, user, IP, breadcrumbs and personal data stripped (`scrubEvent`) | The plan's retention; confirm it in the project settings and record it here | `observability.md` |
| Cloudflare Access | Staff email and sign-in events for the staff host | Cloudflare's Access log retention for the account; confirm and record it here | Staff only, never members |
| Mobile Sasa | Phone number and message text of each SMS sent | Mobile Sasa's own retention, under its terms as processor (D43); confirm and record it here | Messages carry the reference and status only (FR-8) |
| Exported CSV files (FR-12) | Every active member's name, FWO, phone, HBC, departments | Wherever the administrator saved it. The page asks them to keep it only where needed and delete it when done; each export is audited with its row count | Outside the platform's control |
| The officer desk's unfinished form | A member's details being typed | That browser tab's `sessionStorage`, until the form is sent or the tab is closed; cleared on sign-out | Never on the server |
| Paper | Members who decline storage outside Kenya (BR-15), paper ballots and tallies | The church office's paper records | Outside the platform; Q17 |

## Open items

- Sentry, Cloudflare Access and Mobile Sasa retention: confirm each in the provider's settings or terms and record it above.
- Removal on request (erasure, or withdrawing consent to storage outside Kenya): proposed as D54 in #74, not decided. Until then, see `data-subject-requests.md`.
- Election records: #121 (Release 2).
- Registrations never decided (left submitted, or waiting for a correction) keep their details until a decision: #141.
