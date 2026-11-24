# Membership Registry — Release 1 Requirements

| | |
|---|---|
| Status | Draft v0.3 — accelerated timeline; elections added as Release 2 |
| Date | 24 November 2026 |
| Mandate | Approved by the Vicar and PCC (record minute/resolution reference here) |
| Target | Build complete Thursday 26 November 2026; announced at services Sunday 29 November; registration open about 30 November – 1 December |
| Go/no-go review | Before registration opens to the public (criteria in §10) |
| Elections | Release 2: non-binding pilot at Jerusalem and Zion Freretown on 13 December 2026, paper official; official use from the January 2027 elections if the pilot passes. See `docs/architecture/domain-model.md` §4. |

## 1. Purpose

Establish an accurate, verified register of adult members of ACK Emmanuel Kengeleni-Freretown, captured through online self-registration and assisted registration at HBC and department AGMs, and approved by a membership administrator. This register is the foundation for future member services and online elections. Release 1 does not include elections.

## 2. Confirmed decisions

| # | Decision | Source |
|---|---|---|
| D1 | FWO numbers are issued per adult by the church secretary on joining; each person has their own | Discovery, 24 Nov 2026 |
| D2 | FWO numbers are purely numeric and never reused | Discovery, 24 Nov 2026 |
| D3 | FWO numbers are visible in church (printed envelopes), so they identify a record but never authenticate a person | Discovery, 24 Nov 2026 |
| D4 | Registry covers adults (18+) only | Discovery, 24 Nov 2026 |
| D5 | The existing secretary's list is unreliable; it is not imported as official data in Release 1 | Discovery, 24 Nov 2026 |
| D6 | "Children Ministry" is the department name (replaces "Sunday School") | Discovery, 24 Nov 2026 |
| D7 | A member belongs to one HBC, zero or more departments, and the parish; future elections occur at all three levels | Discovery, 24 Nov 2026 |
| D8 | Members do not have online accounts in Release 1; only staff sign in | Architecture discussion |
| D9 | ~~Personal data is hosted in Kenya~~ **Superseded:** the database is Neon Postgres in the EU (Frankfurt) and the application runs on Cloudflare Workers, with each member's explicit consent to storage outside Kenya (BR-15) | ADR 0002, 24 Nov 2026 |
| D10 | Members can check their own status from their phone, after OTP verification | Requested 24 Nov 2026 |
| D11 | The interface is bilingual (English and Kiswahili) at launch | Committee review, 24 Nov 2026 |
| D12 | Membership Administrators and Registration Officers are the Church Secretary and the Wardens | Committee review, 24 Nov 2026 |
| D13 | Personal details in rejected and withdrawn registrations are redacted (removed) 12 months after the final decision | Committee review, 24 Nov 2026 |
| D14 | The status check shows the member's HBC so members can spot a wrong HBC before their AGM | Committee review, 24 Nov 2026 |
| D15 | Expected size: about 600 adult members | Committee review, 24 Nov 2026 |
| D16 | HBC elections fill five positions: Chairperson, Vice Chairperson, Secretary, Assistant Secretary, Treasurer; one vote per position per voter | Committee, 24 Nov 2026 |
| D17 | Candidates can be nominated beforehand or from the floor | Committee, 24 Nov 2026 |
| D18 | Every approved member of an HBC may vote in that HBC's election, whether or not they attend; elections are separate from the AGM agenda | Committee, 24 Nov 2026 |
| D19 | 13 December 2026 is a non-binding pilot at Jerusalem and Zion Freretown; paper results are official | Committee, 24 Nov 2026 |
| D20 | No two members share a phone number; each phone number belongs to one member | Committee, 24 Nov 2026 |
| D21 | Members with their own phone vote online (FWO + phone OTP). Members without one vote manually on election day, after an officer checks in the system that they have not already voted | Committee, 24 Nov 2026 |
| D22 | A member is eligible to vote only if approved before nominations open | Committee, 24 Nov 2026 |

## 3. Roles in Release 1

| Role | Can do | Cannot do |
|---|---|---|
| Public visitor | Submit a self-registration; check own status after OTP | See any other person's data |
| Registration Officer | Submit assisted registrations; submit corrections when asked | Approve or reject; edit approved members; export |
| Membership Administrator | Review, approve, reject, request correction; edit member records; manage HBCs and departments; one logged CSV export | Approve a registration they personally captured (BR-10); manage staff accounts |
| Super Administrator | Manage staff accounts and role assignments; everything an administrator can do | Bypass the audit log |

HBC Coordinator and Department Coordinator roles are deferred to Release 2.

**Release 1 assignments:** the Church Secretary and the Wardens hold both the Membership Administrator and Registration Officer roles. BR-10 still applies: none of them can approve a registration they captured themselves. Super Administrators and additional desk officers for busy AGM days are still to be named (Q8, Q9).

## 4. Reference data (seeded, then admin-managed)

**HBC zones (11):** Jordan, Judea, Galilaya, Samaria, Zion Leisure, Zion Bombolulu, Zion Freretown, Damascus, Jerusalem, Bethlehem B, Bethlehem A.

**Departments (8):** Mother's Union, KAMA / AMF, Kiswahili Choir, English Choir, KAYO, Children Ministry, Evangelism, G.F.S.

HBCs and departments can be added, renamed and deactivated by administrators. They are never deleted once referenced, and a deactivated unit cannot be chosen on new registrations.

## 5. Business rules

| ID | Rule |
|---|---|
| BR-01 | FWO number is required for existing members, digits only, stored as text (to preserve any leading zeros). No length rule until real numbers are reviewed. New members without one follow BR-16. |
| BR-02 | An FWO number can belong to at most one member record, ever, including deceased and transferred members. Enforced by a database constraint. |
| BR-03 | A submitted registration whose FWO matches an existing member or another open registration is accepted and flagged for the administrator. The public user is never told the FWO is already in use. |
| BR-04 | Every member has exactly one current HBC, which must be active. HBC history is effective-dated. |
| BR-05 | Department membership is optional and multiple. In Release 1, departments chosen by the registrant are recorded as *declared*, not *confirmed*. |
| BR-06 | A phone number must be the member's own: a valid Kenyan mobile number, stored in E.164 format (+254…), belonging to no other active or inactive member. Self-registration requires one. A member without a phone of their own is registered by an officer with "No personal phone"; they receive no SMS and vote in person (D21). A registration whose phone already belongs to another member is accepted, flagged PHONE_CONFLICT for the administrator, and never revealed on the public form. |
| BR-07 | Registrants must declare they are 18 or older and acknowledge the privacy notice. No date of birth is collected. |
| BR-08 | No registration becomes a member record without approval by a Membership Administrator. |
| BR-09 | A registration is never edited in place; each submission or correction creates a new immutable revision. |
| BR-10 | The officer who captured an assisted registration cannot approve that registration. |
| BR-11 | Phone verification proves control of a phone at a point in time. It is not proof of identity or membership. Verification evidence is recorded separately from status. |
| BR-12 | Every state change and every access to personal data by staff is written to the audit log with actor, timestamp, action and before/after values. |
| BR-13 | The status check reveals information only after OTP verification, and only for a record matching both the verified phone and the given FWO. All non-matches return the same response. |
| BR-14 | 12 months after a registration is rejected or withdrawn, its personal details (name, FWO, phone, HBC, departments) are redacted (removed) from every revision. The reference, channel, dates, status and reasons are kept. Audit entries for that registration are redacted of personal values at the same time, so the audit log cannot become a back door around retention. Redaction runs automatically and is itself audited. |
| BR-15 | Every registration requires the member's explicit consent to their details being stored on servers outside Kenya (EU). The consent is a separate checkbox, not ticked by default, recorded with the privacy-notice version. For assisted registrations the officer confirms the member gave this consent verbally. Without it, the registration cannot be submitted online. |
| BR-16 | A person without an FWO number registers as a new member by choosing "I am new / I don't have an FWO number yet". The registration is submitted without an FWO and flagged NEW_MEMBER. The member is told by SMS to see the Church Secretary, who meets them, issues an FWO number as today, and enters it in the system. Approval is impossible until an FWO number is entered. From then on, the platform is where newly issued FWO numbers are recorded. |

## 6. Status model

**Registration** (the application):

```
SUBMITTED ──► APPROVED
    │    └──► REJECTED
    └──► CORRECTION_REQUESTED ──(new revision)──► SUBMITTED
SUBMITTED / CORRECTION_REQUESTED ──► WITHDRAWN (staff action, with reason)
```

There is no `PENDING_VERIFICATION` state: self-registrations require OTP before submission, so unverified data never enters the registry. There is no `UNDER_REVIEW` state: concurrent reviewers are handled by optimistic concurrency (an action fails if the registration changed since the reviewer opened it).

**Member** (the official record): `ACTIVE`, `INACTIVE`, `DECEASED`, `TRANSFERRED_OUT`. Status changes require a reason and are audited.

**Verification evidence** (zero or more per registration): `PHONE_OTP` (timestamp), `IN_PERSON` (officer, event/AGM, timestamp), `FWO_CONFIRMED_BY_SECRETARY` (administrator, timestamp).

**Election eligibility** is never stored as a status. It will be derived by policy in the elections module.

## 7. Functional requirements

### FR-1 Self-registration

The public registration page collects full name, FWO number, phone number, HBC (single choice), departments (optional, multiple), the 18+ declaration, and privacy-notice acknowledgement.

- Given valid details, when the user verifies the OTP sent to their phone, then the registration is stored as `SUBMITTED` with channel `SELF`, a human-readable reference (e.g. `REG-7K3M9`) is shown on screen and sent by SMS.
- Given missing or invalid fields, the form shows a plain-language message next to each field and keeps all entered values.
- Given an FWO already in use, the user sees the normal success screen; the registration is flagged for the administrator (BR-03).
- Given a phone number that already belongs to another member, the user sees the normal success screen; the registration is flagged PHONE_CONFLICT (BR-06). The administrator resolves it before approval: one member keeps the number, the other gives a number of their own or is recorded with no personal phone.
- The form states plainly: "Use a phone number that is yours alone. If you don't have one, the church office will register you and you will vote in person."
- The form is protected by Cloudflare Turnstile and per-phone and per-IP rate limits.

### FR-2 Phone OTP

- A 6-digit code, valid for 5 minutes, maximum 5 attempts, resend allowed after 60 seconds, maximum 3 sends per phone per hour.
- Codes are stored hashed and never logged.
- Only Kenyan mobile numbers can receive codes.

### FR-3 Assisted registration desk

A signed-in Registration Officer captures the same fields as FR-1, plus the verification method and the event (for example "Judea HBC AGM, 17 Jan 2027").

- Given the member has their phone present, the officer can trigger an OTP and record `PHONE_OTP` evidence.
- Given the phone is not present, the registration can still be submitted, with the phone marked unverified and `IN_PERSON` evidence recorded.
- Given the member has no phone of their own, the officer ticks "No personal phone" and submits without a phone number. The member receives no SMS, checks their status through the office, and votes in person.
- The officer confirms on screen that they have read the details back to the member and that the member acknowledged the privacy notice.
- Submitted registrations have channel `ASSISTED` and record the capturing officer.
- The desk works on a mid-range Android phone held by the officer.

### FR-4 Review queue

The Membership Administrator sees submitted registrations, oldest first, filterable by HBC, channel, flag (FWO conflict BR-03, phone conflict BR-06, new member BR-16) and event.

- The administrator can approve, reject (reason required), or request correction (reason required, visible to staff).
- Approving creates the member record, with HBC and declared departments, in a single transaction.
- Given an FWO collision, approval is blocked until the administrator resolves it by rejecting the registration or by linking it as an update to the existing member.
- Given another reviewer acted on the same registration first, the action fails with a clear message and the latest state is shown.

### FR-5 Corrections (staff-assisted in Release 1)

- When a correction is requested, the member receives an SMS asking them to contact the church office or visit the desk; no self-service link in Release 1.
- An officer or administrator submits the corrected details as a new revision; the previous revision remains viewable.

### FR-6 Member records

- Administrators can view and edit member records. Every edit requires a reason and is audited.
- HBC changes close the previous HBC period and open a new one.
- Administrators can set member status (BR rules in §6).

### FR-7 Membership status check

A public page where a person enters a phone number and FWO number and verifies an OTP.

- Given a match on both, the page shows one of: "Received — waiting for approval", "Please contact the church office about your registration" (correction requested or rejected), "Registered member" (approved and active).
- For "Received" and "Registered member", the page also shows the HBC on record, with the message: "If this HBC is wrong, please tell the church office or the desk at your AGM."
- Given any non-match, or a member record that is inactive, deceased or transferred, the page shows the same response: "We couldn't find a record matching these details. Please contact the church office."
- No name or department is shown in Release 1.
- Same rate limits and Turnstile protection as FR-1.

### FR-8 SMS notifications

- SMS on submission (with reference), on correction request, and on approval.
- All SMS is sent through an outbox so a provider outage never loses a message or fails the registration; delivery status is recorded.
- SMS text contains no information beyond the reference and status.

### FR-9 Reference data administration

- Administrators can add, rename, reorder and deactivate HBCs and departments. Renames keep history.

### FR-10 Staff accounts and authentication

- Staff accounts are created by a Super Administrator only; no self sign-up.
- Staff sign in with email and password plus a second factor (passkey or authenticator app). SMS is not accepted as a second factor for administrators.
- Sessions are server-side and revocable; idle timeout 30 minutes for administrators, 4 hours for officers on desk days.
- The admin interface is served from its own subdomain with host-only cookies.

### FR-11 Audit log

- Append-only; the application's database role cannot update or delete audit entries.
- Administrators can view the audit trail for any registration or member. Only Super Administrators can view the full log.

### FR-12 Export

- One CSV export of approved active members (name, FWO, phone, HBC, departments), available to Membership Administrators.
- Every export is logged with who, when and how many records.

## 8. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 Data location | Database in Neon's EU (Frankfurt) region; application on Cloudflare Workers (ADR 0002). Every registration records the member's explicit consent to storage outside Kenya (BR-15). Data processing agreements with Neon and Cloudflare are on file. |
| NFR-2 Low bandwidth | The public registration and status-check pages load under 200 KB on first visit and are usable on a throttled 3G connection. |
| NFR-3 Devices | Works on current Chrome for Android and Safari for iOS on low-end phones; no app install required. |
| NFR-4 Accessibility | WCAG 2.2 AA; minimum 16px body text; large tap targets; errors described in words, not colour alone. |
| NFR-5 Language | All public pages, SMS messages, the privacy notice and the officer desk are available in English and Kiswahili at launch. A language switch is visible on every page and the choice is remembered. SMS goes out in the language used at registration. Kiswahili text is reviewed by a fluent member of the congregation before go-live, not machine-translated and shipped. The administrator screens may be English-only in Release 1. |
| NFR-6 Availability | Production is monitored, and a named person is on call during every AGM window. Paper forms are the documented fallback. |
| NFR-7 Backups | Daily backups plus point-in-time recovery; one restore drill completed before go-live. |
| NFR-8 Security testing | Authorisation tests for every role/action pair; end-to-end tests for self-registration, assisted registration, approval and status check. |
| NFR-9 Logging | Structured logs with request IDs; phone numbers, names, FWO numbers and OTP codes are never written to application logs. |
| NFR-10 Privacy notice | Published before go-live, in English and Kiswahili, linked from every form. |

## 9. Out of scope for Release 1

Member login and portal; HBC and Department Coordinator roles and views; coordinator confirmation of departments; self-service corrections; HBC transfers requested by members; import of the legacy secretary's list; SMS/USSD versions of registration or status check; contributions; communications. Elections are Release 2, specified separately.

## 10. Go/no-go criteria (before registration opens)

1. Vicar/PCC approval minute recorded.
2. ODPC registration submitted.
3. Privacy notice published.
4. OTP delivery tested on Safaricom and Airtel numbers.
5. End-to-end tests passing for FR-1, FR-3, FR-4 and FR-7.
6. A backup restored successfully.
7. At least two trained officers assigned to each January AGM.
8. Paper fallback forms printed.
9. Data processing agreements with Neon and Cloudflare accepted in church-owned accounts.
10. ODPC confirmation of safeguards for storing data outside Kenya obtained, or the Vicar has decided, on advice, to open registration while it is pending.

If any criterion fails, registration does not open; members continue on paper forms with identical fields and the launch moves.

## 11. Open questions

Resolved: Q1 → D11, Q2 → D12, Q3 → D13 / BR-14, Q4 → D14, Q6 → D15.

| # | Question | Owner |
|---|---|---|
| Q5 | Which body registers with the ODPC as data controller: the parish (ACK Emmanuel Kengeleni-Freretown) or the Diocese of Mombasa? | Vicar |
| Q7 | Who owns the Kiswahili translation and its review? | Committee |
| Q8 | Who staffs the desks on 17 January, when five HBC AGMs run on the same day? | Committee |
| Q9 | Who are the two Super Administrators? Proposal: Danny plus one committee member who is not the Secretary or a Warden. | Committee |
| Q10 | A new member (BR-16) has no FWO number until the Secretary issues one, but the status check (FR-7) needs phone + FWO. How does a new member check their status? Option: phone + registration reference (REG-…) instead of FWO. | Committee |
| Q11 | Should a Data Protection Impact Assessment be completed before registration opens? Processing religious affiliation at scale is likely "high risk" under the Data Protection Act, 2019, s. 31. Proposed as a go/no-go item. | Vicar (data controller) |
| Q12 | What is the daily SMS spending cap? A cap stops OTP abuse ("SMS pumping") from running up the bill; when reached, OTP sending pauses and staff are alerted. | Committee |
| Q13 | How long are approved members' records kept after they are marked deceased or transferred out? BR-14 covers only rejected and withdrawn registrations. | Vicar |
| Q14 | Neon plan for production: Free (6-hour restore window) or Launch (7 days, usage-based, a few dollars a month). See ADR 0002 amendment. | Committee (budget) |
| Q15 | Who is the named contact for a personal-data breach, responsible for notifying the ODPC within 72 hours (s. 43)? | Vicar |
| Q16 | FWO numbers are visible on envelopes (D3), so someone could self-register with another member's name and FWO and their own phone. If the real member never registers, nothing is flagged, and that phone could later vote for them. Should approval (or remote voting) require `IN_PERSON` or `FWO_CONFIRMED_BY_SECRETARY` evidence as well as `PHONE_OTP`? | Committee |
| Q17 | Members who decline storage outside Kenya (BR-15) stay on paper. How do they get into an election's electorate (D18)? | Committee |
| Q18 | Many older members share a family phone (PRODUCT.md), so phone conflicts (BR-06) will be common. Who resolves them, with what script, and what SMS do members receive? Members recorded with no personal phone vote in person only (D21), which limits D18 "whether or not they attend": is that trade-off accepted? | Committee |
| Q19 | Are FWO numbers "0042" and "42" the same number? BR-01 keeps leading zeros, so today both could exist as different members. | Church Secretary |
| Q20 | When the Secretary issues new FWO numbers (BR-16), how do we avoid reusing a number already on an envelope held by someone not yet registered (the old list is not imported, D5)? Option: record the highest number issued so far and allocate above it. | Church Secretary |
| Q21 | What exactly does "every access to personal data by staff" (BR-12) log: each record opened, each list page, searches, exports? | Committee |
| Q22 | The Secretary and Wardens hold both roles (D12), but sessions time out after 30 minutes for administrators and 4 hours for officers (FR-10). Which applies to them? | Committee |
| Q23 | FR-4 "link as an update to the existing member": which fields change, how HBC history is recorded, and what evidence is needed? | Committee |
| Q24 | Can a staff member approve a registration for themselves or a close relative? BR-10 only covers the capturing officer. | Committee |
| Q25 | D22 says eligible if approved before nominations *open*, but the electorate is frozen when nominations *close*. Which date decides the member's HBC for voting? | Committee |
| Q26 | Every revision requires `transfer_consent` (BR-15), including a staff correction made without the member present. Should the consent carry over from the previous revision instead? | Committee |

## 12. Sizing notes

About 600 adult members across 11 HBCs is small for the system. Load and storage are not concerns. The real constraints are people and SMS:

- **Desk throughput:** an assisted registration takes about 3 minutes, so one officer handles about 20 people an hour. The 17 January cluster (five HBCs, roughly 270 members if evenly spread) is the peak.
- **Review workload:** about 600 approvals at 1–2 minutes each is roughly 10–20 hours of reviewing, spread over January.
- **SMS volume:** roughly 4 messages per member (OTP, submission, approval, a status check), so about 2,500 SMS for the whole intake. Get a quote from the provider before go-live.
- **Self-registration campaign:** announcing self-registration at Sunday services in December reduces desk queues in January. Every member who registers online beforehand only needs a quick check at their AGM.
