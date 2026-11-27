# Data Protection Impact Assessment — Membership Registry

| | |
|---|---|
| Status | **Draft for the Vicar's review.** Not yet signed or submitted |
| Template | Data Protection (General) Regulations, 2021, Third Schedule (reg. 50(1)) |
| Covers | Release 1: the membership registry (registration, review, status check). Release 2 elections are **not** covered; see "Changes that need a new assessment" |
| Prepared | 24 November 2026, updated 26 November 2026 (D47–D50), by the technical lead, from `docs/product/requirements.md` and `docs/architecture/` |
| Decision | D41: a DPIA is completed, signed by the Vicar and submitted to the Data Commissioner |

> **Timing (Q28, needs a decision before registration opens).** The Data Protection Act, 2019, s. 31(5) says DPIA reports "shall be submitted sixty days prior to the processing of data". Under reg. 52(3), if the Data Commissioner has not responded within sixty days of submission, processing may start and the report is taken as approved. Registration is planned to open around 30 November 2026. How to reconcile the two is a decision for the Vicar, on legal advice. It is not a technical decision.

## Part 1: Description of the processing operations

| | |
|---|---|
| Data controller | ACK Emmanuel Freretown - Kengeleni (the parish), D23 |
| Postal address | P.O. Box 85010-80100, Mombasa |
| Email address | ackemmanuelkengeleni@gmail.com (the church's address) |
| Telephone number | +254 790 255515 |

### 1. Project name

ACK Emmanuel Freretown - Kengeleni membership registry (ackemmanuelfreretown.org), Release 1.

### 2. Need for a DPIA

Required. The registry records who is a member of the church, so every record reveals the person's **religious belief or affiliation**. That is sensitive personal data under the Act, whose s. 2 definition covers data revealing a person's "conscience, belief". Regulation 49(1)(e) lists "processing sensitive personal data" as a high-risk operation that needs a DPIA before processing (reg. 49(2)). The registry also uses new technology for the parish (reg. 49(1)(i)), and in Release 2 it will hold voting records.

### 3. Project outline

The parish is replacing its paper list with a verified register of adult members (18+, D4), about 600 people (D15) across 11 Home Based Cells (HBCs) and 8 departments. Members on the cleaned parish list are imported once, with their permission and the Vicar's confirmation of their consent (D47). Others register themselves online, or are registered by a church officer at a desk (for example at an HBC AGM). A Membership Administrator reviews and approves each registration. Members can check their own status from their phone. The register is the basis for future member services and for HBC, department and parish elections (Release 2).

### 4. Personal data

| Who | Data | Notes |
|---|---|---|
| Registrants and members | Full name; FWO number; phone number (or "no personal phone"); HBC and HBC history; departments (declared); 18+ declaration; privacy-notice acknowledgement and version; consent to storage outside Kenya; preferred language; registration reference, channel and status; reasons for staff decisions; verification evidence (phone OTP, seen in person, FWO confirmed by Secretary) | Membership itself is sensitive data (religious affiliation). No date of birth, ID number, address or photo is collected |
| Staff (Secretary, Wardens, Super Administrators) | Name, email, password hash, second factor (authenticator app secret and backup codes, encrypted), sessions (with IP address and browser), roles, every action they take (audit log) | |
| Anyone using a public page | IP address and browser signals for rate limiting and Cloudflare Turnstile; one-time codes (stored only as hashes and deleted after expiry) | |
| SMS | Phone number and message text (reference and status only, FR-8) | Sent through Mobile Sasa (D43) |

### 5. Information flow

- **Collection.** Directly from the member: on the public form at `/registration` after verifying their own phone by one-time code, or by an officer at a desk with the member present (FR-1, FR-3). From the parish list, cleaned by the Church Secretary and imported once by a Membership Administrator, with the members' permission and the Vicar's confirmation of their consent to storage outside Kenya (D47, FR-13); the uploaded file is read in memory and not kept, and imported phone numbers stay unverified until the member uses a code.
- **Use.** Administrators review, approve, correct and maintain records (FR-4 to FR-6). Members see their own status after phone verification (FR-7). One logged CSV export of active members is available to administrators (FR-12).
- **Storage.** PostgreSQL on Neon, AWS Frankfurt region (EU), production on the Launch plan with a 7-day restore window (D26). Nightly encrypted backups in Cloudflare R2 (#8).
- **Application.** Cloudflare Workers (global edge network); the staff portal is on a separate host behind Cloudflare Access.
- **Transfers outside Kenya.** The database and backups are in the EU; the application runs on Cloudflare's network; GitHub Actions runners (which run the backup job) and Sentry may be outside the EU. Every member gives explicit, separate consent to storage outside Kenya (BR-15), as s. 49(1) requires for sensitive data; for imported members it was given to the parish and is confirmed by the Vicar for the batch (D47).
- **Retention and deletion.** Rejected and withdrawn registrations are redacted after 12 months, including their audit entries (BR-14, D13). One-time codes are deleted after expiry. Backups expire on a lifecycle rule (#8). Members marked deceased or transferred out have their name, phone number and departments removed one year later; the FWO number is kept so it is never reissued (D45).
- **People affected.** About 600 adult members, plus around 10 staff users.

### 6. Compliance with the data protection principles (s. 25)

| Principle | How the registry complies |
|---|---|
| Lawful, fair, transparent | Processing by a religious not-for-profit body, relating solely to its members, not disclosed outside the church without consent (s. 45(a)); explicit consent for storage outside Kenya (s. 49(1)); privacy notice at `/privacy` before go-live, in English (Kiswahili optional, D44), versioned and recorded on every registration (NFR-10, #27) |
| Purpose limitation | Used only to keep the register and, from Release 2, to run church elections. No marketing, no sharing with the Diocese or third parties |
| Data minimisation | No date of birth (18+ is a declaration, BR-07), no ID numbers, no address; departments are optional; the status check shows status, name and HBC only, and only after a code and a match on both phone and FWO number or reference (FR-7, D48) |
| Accuracy | Administrator approval (BR-08); the parish list cleaned by the Church Secretary before import, rows breaking a rule skipped (D47, FR-13); members see their name and HBC on the status check (D14, D48); corrections create new revisions (BR-09, FR-5) |
| Storage limitation | Automatic redaction of rejected and withdrawn registrations after 12 months (BR-14) and of former members one year after they are marked deceased or transferred out (D45) |
| Integrity and confidentiality | See Part 3: EU hosting, encryption in transit and at rest, role-based access, second factor for staff, append-only audit log, no personal data in logs (NFR-9) |
| Data subject rights | Through the church office: access, correction (FR-5) and objection; status check for members (FR-7) |

## Part 2: Necessity and proportionality

| Question | Assessment |
|---|---|
| Lawful basis | s. 45(a): legitimate activities of a religious not-for-profit body, relating solely to its members, with appropriate safeguards, not disclosed outside the body without consent. Explicit consent for the transfer outside Kenya (s. 49(1), BR-15). _To be confirmed on legal advice._ |
| How consent is obtained | A separate checkbox, not ticked by default, recorded with the privacy-notice version. At a desk, the officer confirms the member gave it verbally (BR-15). A staff correction carries it over unless the notice changed (D35). Imported members (D47): consent given to the parish before the import, in a form, on a date and with evidence the parish records here before the import runs: _to be completed by the Vicar_. It must have covered storage outside Kenya. The Vicar's confirmation is recorded with each imported member |
| Is personal data key to the purpose? | Yes. A register of members cannot be kept without identifying members |
| Could the outcome be reached without it? | Paper registers remain the fallback (§10), but they cannot verify phone numbers or support remote voting |
| Data quality and minimisation | See principle table above |
| Notifying data subjects | Privacy notice linked from every form (NFR-10); SMS confirmation of submission and approval (FR-8). Imported members, who see no form and get no SMS on import: an announcement at services before the import, the privacy notice (updated under D50), and the status check, where they can see their own record (D47, D48) |
| Exercising data subject rights | Requests go to the church office; staff act through the admin portal, and every action is audited (BR-12) |
| Parties and roles | Controller: the parish (D23). Processors: Neon (database), Cloudflare (hosting, Turnstile, Access, R2 backups), Mobile Sasa (SMS, D43), Sentry (error reports, personal data stripped), GitHub (code, CI and the backup job runner) |
| Measures to ensure processor compliance | Data processing agreements accepted for each vendor account (go/no-go item 9). The accounts may be in the technical lead's name, with the church email given access to each so the parish keeps control (D40, amended 25 Nov 2026) |
| Processing safeguards | See Part 3 |
| Safeguards before cross-border transfer | EU region chosen for its comparable law (GDPR); explicit consent (BR-15); data processing agreements; ODPC confirmation of safeguards sought (go/no-go item 10) |

## Part 3: Risks and measures

Score = impact × likelihood, each from 1 (low) to 5 (high), assessed with the current controls in place.

| # | Risk | Consequence | Owner | Current controls | Impact | Likelihood | Score | Further actions |
|---|---|---|---|---|---|---|---|---|
| R1 | Unauthorised access to the database or a backup | Members' religious affiliation and phone numbers exposed | Technical lead | EU hosting; encryption in transit and at rest; separate database roles with minimal grants; secrets only in Cloudflare; encrypted backups | 5 | 2 | 10 | Restore drill and access review before go-live (#8); limit Neon console access (D40) |
| R2 | Someone uses a public page to learn whether a person is registered | Disclosure of affiliation; harassment | Technical lead | Identical responses for all non-matches (BR-03, BR-13); OTP before any result; Turnstile and rate limits; daily SMS cap (D25) | 4 | 2 | 8 | Test enumeration in end-to-end tests (NFR-8) |
| R3 | Someone registers with another member's FWO number and their own phone | Wrong record; a vote cast in someone else's name (Release 2) | Membership Administrator | Duplicate FWO flagged for the administrator (BR-03); administrator approval (BR-08) | 3 | 2 | 6 | Accepted risk, detected rather than prevented (D27) |
| R4 | Staff look at or export more than they need | Misuse of members' data | Vicar | Role-based access; second factor; record views, searches and exports audited (D31); one logged export (FR-12); no self-approval (BR-10, BR-17) | 4 | 2 | 8 | Periodic audit-log review by a Super Administrator |
| R5 | Personal data leaks into logs, error reports, analytics or URLs | Exposure to vendors and anyone with log access | Technical lead | Rule: names, phones, FWOs and codes never logged (NFR-9); error reports scrubbed; no analytics on member pages | 3 | 2 | 6 | Automated checks in CI; Sentry scrubbing configured before go-live (#9) |
| R6 | An SMS on a shared family phone reveals another person's registration | Disclosure within a household | Membership Administrator | SMS contains only reference and status (FR-8); one member per phone (D20); conflicts resolved by phone call (D28) | 2 | 3 | 6 | Kiswahili and English SMS wording reviewed (D39) |
| R7 | Transfer outside Kenya without valid consent or confirmed safeguards | Unlawful processing (s. 49) | Vicar | Separate explicit consent (BR-15); members who decline stay on paper; for imported members, the form, date and evidence of their consent recorded before the import, and the Vicar's confirmation recorded with each one (D47) | 4 | 2 | 8 | Obtain ODPC confirmation, or the Vicar's documented decision to proceed (go/no-go item 10) |
| R8 | The nightly backup job runs on a GitHub-hosted runner outside the EU | Exposure if the runner or GitHub were compromised | Technical lead | Read-only `ack_backup` login; the dump is streamed through age encryption, so no unencrypted copy is written to disk; backups stored in R2's EU jurisdiction and deleted after 35 days; private key held offline | 4 | 1 | 4 | — |
| R9 | Records kept longer than needed | Unnecessary exposure | Vicar | Automatic redaction after 12 months (BR-14) and one year after a member is marked deceased or transferred out (D45); backup lifecycle (#8) | 2 | 3 | 6 | Build the former-member redaction job (#26) |
| R10 | Data lost or unavailable during registration | Members must re-register; loss of trust | Technical lead | Point-in-time restore for 7 days (D26); nightly backups; paper fallback (§10) | 3 | 2 | 6 | Restore drill before go-live (go/no-go item 6) |
| R11 | Inaccurate records (wrong HBC, wrong person) | Wrong electorate in Release 2 | Membership Administrator | Approval step; name and HBC shown on status check (D14, D48); revisions keep history; imported rows that break a rule are skipped, not guessed (FR-13) | 2 | 3 | 6 | — |
| R12 | A breach is not noticed or not reported in time | Harm to members; breach of s. 43 | Vicar | Breach procedure (`docs/compliance/breach-response.md`, D42) | 4 | 2 | 8 | Contacts and processor notification terms confirmed before go-live |
| R13 | The imported parish list holds an out-of-date phone number or a wrong name | Whoever now holds a recycled number, with the member's FWO number from an envelope (D3), sees the member's name and HBC on the status check (D48), and in Release 2 could vote in their name | Membership Administrator | List cleaned by the Church Secretary before import; one member per phone (D20); members told at services that the list is in the registry, so they check their own record (D47, D48) and ask the office to correct it. The registry does not record whether an imported phone has ever been checked by a code | 3 | 2 | 6 | Before Release 2 voting, decide whether an imported member's phone must be confirmed first |

## Changes that need a new assessment

Regulation 49(1)(d) treats any change that may raise the risk to members as needing a DPIA. Update this assessment, and submit it again where s. 31(5) applies, before:

- **Release 2 elections, including the 13 December pilot.** These add who voted (participation records), candidates and encrypted ballots, and so a new risk to ballot secrecy (`docs/architecture/domain-model.md`, "Known gaps in ballot secrecy"). Already decided for it: election records that name a member (the electorate, participation, check-ins) are removed one week after the election's final result is declared (D51); nomination records two weeks after it; results keep only who was elected, with totals (D52).
- Adding member logins, new data fields, new processors, or sharing with any body outside the parish.

## Part 5: Sign-off and outcomes

| Item | Record |
|---|---|
| Measures approved by | _Vicar, on behalf of the data controller — name, date, signature_ |
| Residual risks approved by | _Vicar — name, date_ |
| Consultation with the ODPC | Required: the assessment finds high risk (s. 31(3)). Submitted on _date_, reference _…_ |
| ODPC response | _date and summary, or "no response within sixty days" (reg. 52(3))_ |
| Kept under review by | The Vicar with the technical lead: at least yearly, and before every change listed above |

The signed copy and the ODPC correspondence are kept in the parish's records, not in this repository.
