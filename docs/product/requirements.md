# Membership Registry — Release 1 Requirements

| | |
|---|---|
| Status | Draft v0.5 — voting pilot scope decided (D37, D38) |
| Date | 24 November 2026 |
| Mandate | Approved by the Vicar and PCC (record minute/resolution reference here) |
| Target | Build complete Thursday 26 November 2026; announced at services Sunday 29 November; registration open about 30 November – 1 December |
| Go/no-go review | Before registration opens to the public (criteria in §10) |
| Elections | Release 2: non-binding pilot at Jerusalem and Zion Freretown on 13 December 2026 with online voting alongside paper, subject to a go/no-go on 4 December (D37); paper official; official use from the January 2027 elections if the pilot passes. See `docs/architecture/domain-model.md` §4. |

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
| D12 | Membership Administrators and Registration Officers are the Church Secretary and the Wardens. Approvals are made by one Membership Administrator (D36) | Committee review, 24 Nov 2026 |
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
| D23 | The parish (ACK Emmanuel Kengeleni-Freretown) is the data controller and registers with the ODPC, not the Diocese of Mombasa (Q5) | Danny (technical lead), 24 Nov 2026 |
| D24 | The status check accepts the FWO number **or** the registration reference (REG-…), after phone OTP. A new member (BR-16) uses their reference until an FWO number is issued (Q10) | Danny (technical lead), 24 Nov 2026 |
| D25 | The daily SMS cap is 1,000 messages (Africa/Nairobi day), kept as a setting administrators can change. Every SMS counts towards it. Staff are warned at 80%. At the cap, OTP sending pauses and other messages wait in the outbox until the next day; staff are alerted (Q12) | Danny (technical lead), 24 Nov 2026 |
| D26 | Production runs on Neon's Launch plan with a 7-day restore window; staging and development stay on the Free plan. Ceiling: US$20 a month for the database (a few dollars expected). If the monthly bill approaches the ceiling, the technical lead tells the committee before it is exceeded (Q14, ADR 0002 amendment) | Danny (technical lead), 24 Nov 2026 |
| D27 | Approved members vote online from anywhere with FWO + phone OTP. No in-person evidence is required to approve a registration or to vote online; elections are not tied to AGMs (D18). Each member votes at most once per election, online or manually, enforced by the database. The voting link opens the ballot page only; it is never a credential. Accepted risk: someone could register with another member's FWO and their own phone. This is detected, not prevented: the real member's registration is flagged (BR-03), and a member told they have already voted is directed to the election officer (Q16) | Danny (technical lead), 24 Nov 2026 |
| D28 | The Membership Administrator resolves phone conflicts (BR-06) by calling both people, using the script in FR-4. No SMS mentions a conflict or another person; members receive only the normal messages (FR-8). Members recorded with no personal phone vote in person only (D21); that limit on D18 is accepted (Q18) | Danny (technical lead), 24 Nov 2026 |
| D29 | Leading zeros in FWO numbers are significant: "0042" and "42" are different numbers. The number is stored and compared exactly as entered (Q19) | Danny (technical lead), 24 Nov 2026 |
| D30 | The Church Secretary records once, as a setting, the highest FWO number ever issued. When issuing a number (BR-16), the system suggests the next number above both that setting and every FWO number in the registry; the Secretary may enter another number if it is not in use (Q20) | Danny (technical lead), 24 Nov 2026 |
| D31 | "Access to personal data" (BR-12) means: opening a registration or member record, running a search (logged with the number of results, never the search terms), and exporting. Viewing queue and list pages is not logged (Q21) | Danny (technical lead), 24 Nov 2026 |
| D32 | A staff user who holds the Membership Administrator or Super Administrator role has the 30-minute idle timeout, even if they also hold Registration Officer. The 4-hour timeout applies only to staff who are Registration Officers alone (Q22) | Danny (technical lead), 24 Nov 2026 |
| D33 | Release 1 does not link a registration to an existing member. An FWO collision is resolved by rejecting the duplicate registration with a reason; if the member's details have changed, the administrator edits the member record (FR-6) (Q23) | Danny (technical lead), 24 Nov 2026 |
| D34 | Staff must not approve their own registration or that of a close relative (spouse, parent, child or sibling); a Super Administrator approves it instead (D36). In Release 1 this is a policy, checked through the audit trail, not enforced by the system (BR-17, Q24) | Danny (technical lead), 24 Nov 2026 |
| D35 | A staff correction carries the member's consent (BR-15) over from the previous revision when the privacy-notice version has not changed. If it has changed, the member must give consent again (Q26) | Danny (technical lead), 24 Nov 2026 |
| D36 | Release 1 has one Membership Administrator who approves registrations. When BR-10 or BR-17 stops them approving one, a Super Administrator approves it (Q24) | Danny (technical lead), 24 Nov 2026 |
| D37 | The 13 December pilot runs full online voting alongside paper at Jerusalem and Zion Freretown. Go/no-go on 4 December 2026: online voting runs only if, by then, the elections ADR (ballot secrecy) is accepted, the election features are built, and a full rehearsal on staging has passed. Otherwise the pilot falls back to electronic check-in only, with no online ballots. The pilot electorate follows D22: only members approved before the pilot's nominations open can vote online; everyone can vote on paper | Danny (technical lead), 24 Nov 2026 |
| D38 | At a pilot, paper is official (D19), so an online vote never stops a member voting on paper. The officer's check-in shows that the member already voted online and records it, but always lets them have a paper ballot. Electronic results stay sealed until the paper result is declared | Danny (technical lead), 24 Nov 2026 |

## 3. Roles in Release 1

| Role | Can do | Cannot do |
|---|---|---|
| Public visitor | Submit a self-registration; check own status after OTP | See any other person's data |
| Registration Officer | Submit assisted registrations; submit corrections when asked | Approve or reject; edit approved members; export |
| Membership Administrator | Review, approve, reject, request correction; edit member records; manage HBCs and departments; one logged CSV export | Approve a registration they personally captured (BR-10); manage staff accounts |
| Super Administrator | Manage staff accounts and role assignments; everything an administrator can do | Bypass the audit log |

HBC Coordinator and Department Coordinator roles are deferred to Release 2.

**Release 1 assignments:** the Church Secretary and the Wardens hold both the Membership Administrator and Registration Officer roles, but only one Membership Administrator approves registrations (D36). When that administrator captured a registration (BR-10), or it is their own or a close relative's (BR-17), a Super Administrator approves it. Super Administrators and additional desk officers for busy AGM days are still to be named (Q8, Q9).

## 4. Reference data (seeded, then admin-managed)

**HBC zones (11):** Jordan, Judea, Galilaya, Samaria, Zion Leisure, Zion Bombolulu, Zion Freretown, Damascus, Jerusalem, Bethlehem B, Bethlehem A.

**Departments (8):** Mother's Union, KAMA / AMF, Kiswahili Choir, English Choir, KAYO, Children Ministry, Evangelism, G.F.S.

HBCs and departments can be added, renamed and deactivated by administrators. They are never deleted once referenced, and a deactivated unit cannot be chosen on new registrations.

## 5. Business rules

| ID | Rule |
|---|---|
| BR-01 | FWO number is required for existing members, digits only, stored as text exactly as entered. Leading zeros are significant: "0042" and "42" are different numbers (D29). No length rule until real numbers are reviewed. New members without one follow BR-16. |
| BR-02 | An FWO number can belong to at most one member record, ever, including deceased and transferred members. Enforced by a database constraint. |
| BR-03 | A submitted registration whose FWO matches an existing member or another open registration is accepted and flagged for the administrator. The public user is never told the FWO is already in use. |
| BR-04 | Every member has exactly one current HBC, which must be active. HBC history is effective-dated. |
| BR-05 | Department membership is optional and multiple. In Release 1, departments chosen by the registrant are recorded as *declared*, not *confirmed*. |
| BR-06 | A phone number must be the member's own: a valid Kenyan mobile number, stored in E.164 format (+254…), belonging to no other active or inactive member. Self-registration requires one. A member without a phone of their own is registered by an officer with "No personal phone"; they receive no SMS and vote in person (D21). A registration whose phone already belongs to another member is accepted, flagged PHONE_CONFLICT for the administrator, and never revealed on the public form. |
| BR-07 | Registrants must declare they are 18 or older and acknowledge the privacy notice. No date of birth is collected. |
| BR-08 | No registration becomes a member record without approval by a Membership Administrator. |
| BR-09 | A registration is never edited in place; each submission or correction creates a new immutable revision. |
| BR-10 | The officer who captured an assisted registration cannot approve that registration. A Super Administrator approves it instead (D36). |
| BR-11 | Phone verification proves control of a phone at a point in time. It is not proof of identity or membership. Verification evidence is recorded separately from status. |
| BR-12 | Every state change and every access to personal data by staff is written to the audit log with actor, timestamp, action and before/after values. Access means opening a registration or member record, running a search (number of results only, never the terms) and exporting; queue and list pages are not logged (D31). |
| BR-13 | The status check reveals information only after OTP verification, and only for a record matching both the verified phone and the given FWO number or registration reference (D24). All non-matches return the same response. |
| BR-14 | 12 months after a registration is rejected or withdrawn, its personal details (name, FWO, phone, HBC, departments) are redacted (removed) from every revision. The reference, channel, dates, status and reasons are kept. Audit entries for that registration are redacted of personal values at the same time, so the audit log cannot become a back door around retention. Redaction runs automatically and is itself audited. |
| BR-15 | Every registration requires the member's explicit consent to their details being stored on servers outside Kenya (EU). The consent is a separate checkbox, not ticked by default, recorded with the privacy-notice version. For assisted registrations the officer confirms the member gave this consent verbally. Without it, the registration cannot be submitted online. A staff correction carries the consent over from the previous revision unless the privacy-notice version has changed, in which case the member consents again (D35). |
| BR-16 | A person without an FWO number registers as a new member by choosing "I am new / I don't have an FWO number yet". The registration is submitted without an FWO and flagged NEW_MEMBER. The member is told by SMS to see the Church Secretary, who meets them, issues an FWO number as today, and enters it in the system. The system suggests the next number above the highest ever issued (D30). Approval is impossible until an FWO number is entered. From then on, the platform is where newly issued FWO numbers are recorded. |
| BR-17 | A staff member must not approve their own registration or a close relative's (spouse, parent, child or sibling); a Super Administrator approves it instead (D36). Release 1 relies on policy and the audit trail, not a system check (D34). |

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
- A daily SMS cap (D25, default 1,000) stops OTP sending when reached and alerts staff; staff are warned at 80%.
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
- Given an FWO collision, approval is blocked until the administrator resolves it by rejecting the registration with a reason. If the existing member's details have changed, the administrator edits the member record (FR-6). There is no linking in Release 1 (D33).
- Given a phone conflict (BR-06), approval is blocked until the administrator resolves it (D28). Script: call the existing member and the registrant; confirm who uses the phone day to day; explain that each member needs a number of their own to vote online; agree who keeps the number; the other gives a number of their own or is recorded with no personal phone and votes in person. The administrator then records the correction and approves.
- Given another reviewer acted on the same registration first, the action fails with a clear message and the latest state is shown.

### FR-5 Corrections (staff-assisted in Release 1)

- When a correction is requested, the member receives an SMS asking them to contact the church office or visit the desk; no self-service link in Release 1.
- An officer or administrator submits the corrected details as a new revision; the previous revision remains viewable.

### FR-6 Member records

- Administrators can view and edit member records. Every edit requires a reason and is audited.
- HBC changes close the previous HBC period and open a new one.
- Administrators can set member status (BR rules in §6).

### FR-7 Membership status check

A public page where a person enters a phone number and their FWO number or registration reference (D24) and verifies an OTP.

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
- Sessions are server-side and revocable; idle timeout 30 minutes for anyone holding the Membership Administrator or Super Administrator role, 4 hours for staff who are Registration Officers only (D32).
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

Resolved: Q1 → D11, Q2 → D12, Q3 → D13 / BR-14, Q4 → D14, Q5 → D23, Q6 → D15, Q10 → D24, Q12 → D25, Q14 → D26, Q16 → D27, Q18 → D28, Q19 → D29, Q20 → D30, Q21 → D31, Q22 → D32, Q23 → D33, Q24 → D34 / BR-17 / D36, Q26 → D35.

| # | Question | Owner |
|---|---|---|
| Q7 | Who owns the Kiswahili translation and its review? | Committee |
| Q8 | Who staffs the desks on 17 January, when five HBC AGMs run on the same day? | Committee |
| Q9 | Who are the two Super Administrators? Proposal: Danny plus one committee member who is not the Secretary or a Warden. | Committee |
| Q11 | Should a Data Protection Impact Assessment be completed before registration opens? Processing religious affiliation at scale is likely "high risk" under the Data Protection Act, 2019, s. 31. Proposed as a go/no-go item. | Vicar (data controller) |
| Q13 | How long are approved members' records kept after they are marked deceased or transferred out? BR-14 covers only rejected and withdrawn registrations. | Vicar |
| Q15 | Who is the named contact for a personal-data breach, responsible for notifying the ODPC within 72 hours (s. 43)? | Vicar |
| Q17 | Members who decline storage outside Kenya (BR-15) stay on paper. How do they get into an election's electorate (D18)? | Committee |
| Q25 | D22 says eligible if approved before nominations *open*, but the electorate is frozen when nominations *close*. Which date decides the member's HBC for voting? Needed before the pilot's nominations open (D37). | Committee |
| Q27 | What must the pilot show for online voting to be used officially in January: for example, electronic and paper results agree, no member voted twice, and OTP worked for most voters? Needed before 13 December. | Committee |

## 12. Sizing notes

About 600 adult members across 11 HBCs is small for the system. Load and storage are not concerns. The real constraints are people and SMS:

- **Desk throughput:** an assisted registration takes about 3 minutes, so one officer handles about 20 people an hour. The 17 January cluster (five HBCs, roughly 270 members if evenly spread) is the peak.
- **Review workload:** about 600 approvals at 1–2 minutes each is roughly 10–20 hours of reviewing, spread over January.
- **SMS volume:** roughly 4 messages per member (OTP, submission, approval, a status check), so about 2,500 SMS for the whole intake. Get a quote from the provider before go-live.
- **Self-registration campaign:** announcing self-registration at Sunday services in December reduces desk queues in January. Every member who registers online beforehand only needs a quick check at their AGM.
