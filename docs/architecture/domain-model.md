# Domain Model

| | |
|---|---|
| Status | v0.1 — registration domain agreed for build; elections domain draft |
| Date | 24 November 2026 |
| Related | `docs/product/requirements.md`, `docs/architecture/database-design.md` |

## 1. Modules and ownership

| Module | Owns | Depends on |
|---|---|---|
| organisation | HBCs, departments | — |
| registration | Registrations, revisions, decisions | organisation, verification, membership (on approval) |
| membership | Members, HBC assignments, department memberships | organisation |
| verification | Phone challenges (OTP), verification tokens, verification evidence, rate limits; Kenyan-number and Turnstile checks | notifications (sends the OTP), audit |
| access | Staff users, role assignments, sessions | membership (optional link) |
| audit | Audit entries, retention redaction | — (every module writes to it) |
| notifications | SMS outbox, templates, SMS settings and the daily cap, the SMS provider (Mobile Sasa, D43) | — |
| elections | Elections, positions, candidates, electorate, participation, ballots, results | membership, organisation, verification |

A module changes only its own tables. Cross-module work goes through the other module's public functions, inside the same database transaction where atomicity matters (for example, approval creates a member).

## 2. Core concepts

**Person vs member vs staff user.** A *Member* is an approved person in the official registry. A *Registration* is an application to become (or update) a member. A *Staff user* is a login account for an officer or administrator; it may link to a Member record but is a separate thing. Members do not have login accounts in Release 1.

**Status vs evidence.** Statuses describe where something is in its lifecycle. Verification is recorded as *evidence* (who verified what, how, when), never as a status.

**Effective dating.** HBC and department membership are recorded as periods (`valid_from`, `valid_to`), so the registry can answer "who belonged to Judea on 10 January?" — the question every electorate snapshot asks.

## 3. Membership and registration

### Entities

| Entity | Key attributes | Notes |
|---|---|---|
| Hbc | name, active, sort order | Renames are audited; never deleted once referenced |
| Department | name, active, sort order | Same rules as Hbc |
| Registration | reference, channel (SELF/ASSISTED), status, language, captured_by, event_label, fwo_conflict and phone_conflict flags, member_id (set on approval) | The application |
| RegistrationRevision | revision_no, full_name, fwo_number, phone, hbc, departments, adult_declared, privacy_notice_version, submitted_by, submitted_at | Immutable snapshot; a correction adds a revision |
| RegistrationDecision | action (APPROVE/REJECT/REQUEST_CORRECTION/WITHDRAW), reason, actor, at | History of reviewer actions |
| PhoneChallenge | phone, purpose, code_hash, expires_at, attempts, verified_at, token_hash, consumed_at | One OTP and its single-use verification token: `verified_at` and `token_hash` are set when the right code is entered, `consumed_at` when a submission redeems the token (#15). Short-lived; purged after 24 hours |
| VerificationEvidence | registration, kind (PHONE_OTP/IN_PERSON/FWO_CONFIRMED_BY_SECRETARY), actor, event_label, at | Many per registration |
| Member | fwo_number, full_name, phone, status, status_reason, language, source_registration | The official record |
| MemberHbcAssignment | member, hbc, valid_from, valid_to | Exactly one open period per member |
| DepartmentMembership | member, department, state (DECLARED/CONFIRMED), valid_from, valid_to, confirmed_by/at | Zero or more open periods per member |

### Invariants

1. A member's FWO number is unique across all members, forever (D2).
2. A member has exactly one open HBC assignment, and HBC periods never overlap.
3. A member has at most one open membership per department.
4. A registration's revisions are never modified, except by retention redaction (BR-14).
5. Approval, member creation, HBC assignment and department memberships happen in one transaction, or not at all.
6. The officer who captured an assisted registration cannot approve it (BR-10).
7. A registration in a final state (APPROVED, REJECTED, WITHDRAWN) accepts no further actions. Enforced by the `registration_guard` trigger as well as in the application.

### Registration lifecycle

```
SUBMITTED ──approve──► APPROVED            (creates or updates a Member)
SUBMITTED ──reject───► REJECTED
SUBMITTED ──request correction──► CORRECTION_REQUESTED ──new revision──► SUBMITTED
SUBMITTED | CORRECTION_REQUESTED ──withdraw──► WITHDRAWN
```

### Member lifecycle

`ACTIVE ⇄ INACTIVE`, `ACTIVE | INACTIVE → DECEASED`, `ACTIVE | INACTIVE → TRANSFERRED_OUT`. Every change needs a reason.

### Audit entries

Every state change calls `audit.write(tx, entry)` inside the transaction that makes the change (CLAUDE.md rule 4, BR-12). It takes a transaction, not a database, so the entry and the change commit or roll back together. The database sets the time; the application cannot change or delete an entry (FR-11).

- **Entity type.** Everything that belongs to a registration (its revisions, verification evidence and decisions) uses `entity_type = 'registration'` and the registration's id (the uuid, never the reference), so retention redaction removes it (BR-14). Redaction matches the id's exact text, so `audit.write` accepts only a lowercase uuid for every entity type except `staff_user`, whose ids are Better Auth's text ids. Other types: `member`, `hbc`, `department`, `staff_user`; add one when a module first audits a new kind of record.
- **Action.** `<entity type>.<verb>` in lowercase snake_case (digits allowed), e.g. `registration.approve`, `member.transfer_hbc`.
- **Actor.** `STAFF` with the staff user id, `PUBLIC` with no id (never a phone number, FWO number or name), or `SYSTEM` for scheduled jobs.
- **Before and after.** Only the fields that changed (`audit.changes(old, new)`). Personal values are allowed where the change needs them; secrets never are. As a safety net, `audit.write` refuses keys that look like an OTP code, hash, PIN, salt, password, token, cookie, authorization or key, at any depth; it cannot recognise a secret under an unrelated name, so callers must never pass one.
- **Access to personal data (D31).** `audit.recordAccess(db, event)`, awaited before the data is returned: opening a registration or member record (`registration.view`, `member.view`), a search (`member.search`, with the number of results, never the terms) and an export (`member.export`, with the row count). Searches and exports use entity id `*`. Queue and list pages are not recorded.
- **Not audited.** Housekeeping jobs that delete short-lived rows after their retention period (OTP challenges, rate-limit buckets, SMS outbox rows; database-design.md §6) change no business state and write no entry. Retention redaction, which does, writes `registration.redact`. Nor are the OTP challenge's own steps: sending a code, checking it, and redeeming its token (#15). They change no business state, the rows are purged after 24 hours, and an audit entry for each would keep a long-lived record of every phone's OTP activity. What they lead to is audited: `PHONE_OTP` evidence writes `registration.verify_phone`.

## 4. Elections (Release 2 — draft)

### Confirmed rules

- An HBC election fills five positions (Chairperson, Vice Chairperson, Secretary, Assistant Secretary, Treasurer), one seat each (D16).
- Each eligible voter casts at most one vote per position (D16).
- Candidates are nominated beforehand or from the floor (D17).
- Every approved, active member of the HBC is eligible, whether or not they attend (D18).
- 13 December 2026 is a non-binding pilot; paper results are official (D19). It runs online voting alongside paper if the 4 December go/no-go passes, and otherwise electronic check-in only (D37).
- At a pilot, an online vote never stops a member voting on paper: the check-in shows and records the online vote but always allows a paper ballot (D38).
- A person may stand for only one position per election (E3).
- A position with a single accepted candidate when nominations close is filled unopposed; no vote is held for it (E3).
- Voting is open for a window of a few hours on the election day (E2).
- Department elections use rosters confirmed by department leaders before nominations close (E4).

### Entities

| Entity | Key attributes | Notes |
|---|---|---|
| Election | title, scope (HBC/DEPARTMENT/PARISH + id), status, is_pilot, voting_opens_at, voting_closes_at | One per HBC, department or parish contest |
| Position | election, name, seats (1), order | Seeded from a template (the five HBC positions) |
| Candidate | position, member, source (PRE/FLOOR), nominated_by, seconded_by, status | Must be in the electorate |
| ElectorateEntry | election, member, remote_allowed | Frozen snapshot taken when nominations close; `remote_allowed` is true when the member has a personal phone on record (E1) |
| VoterParticipation | election, member, channel (ONLINE/MANUAL), recorded_by (officer, for MANUAL), voted_at | "Who voted" — unique per member per election, across both channels. A manual check-in is refused if the member already voted online, and an online vote is refused after a manual check-in. At a pilot, a check-in after an online vote is recorded separately and never refuses the paper ballot (D38); how it is stored is for the elections data model (#32) |
| PaperTally | election, position, candidate (or ABSTAIN), votes, entered_by, confirmed_by | Manual ballot totals; requires two different officers. Final results = online tally + paper tally |
| Ballot | random id, election, sealed payload | "What was voted" — no member reference, no timestamp |
| PositionResult | election, position, candidate, votes; declared_by, declared_at | Written only after voting closes |

### Election lifecycle

```
DRAFT → NOMINATIONS_OPEN → NOMINATIONS_CLOSED (candidates and electorate frozen)
      → VOTING_OPEN → VOTING_CLOSED → TALLIED → RESULTS_DECLARED
```

Floor nominations are entered by the presiding officer while the election is in NOMINATIONS_OPEN. Voting cannot open until nominations are closed.

### Invariants

1. For online votes, participation and ballot are written in one transaction: either both exist or neither. Manual votes record participation only; the ballot is paper.
2. A member appears in VoterParticipation at most once per election (database unique constraint).
3. A Ballot has no column that identifies the voter, and no timestamp.
4. Ballots can be decrypted and counted only after VOTING_CLOSED.
5. The electorate and candidate list cannot change after NOMINATIONS_CLOSED.
6. A candidate must be in that election's electorate.
7. For a pilot election, results stay sealed until the paper result has been declared.

### Ballot secrecy

- Each ballot is encrypted with the election's public key (libsodium sealed box) before it is written to the database, and is stored only in encrypted form.
- The private key is generated for each election and held by the election committee, not by the system operators. It is entered only at tally time.
- Even a database administrator who can see insertion order cannot read ballot contents without the committee's key.
- Residual risk: a database administrator together with a keyholder could correlate insertion order with participation records. Mitigation: two Super Administrators only, both outside the election committee; database access is audited.

### Known gaps in ballot secrecy (review, 24 November 2026)

The design above does not yet give secret ballots. These must be resolved in an elections ADR before any online vote, including the 13 December pilot:

1. **Same-transaction linkage.** Rows written in one transaction share the same transaction id (`xmin`), so anyone who can read both tables can join a ballot to its participation record, with no timestamp column needed. Ballots must not be written in the voter's transaction in a linkable way (for example: write to a holding table, then move ballots in shuffled batches; or re-insert all ballots in random order into a fresh table at close and drop the original).
2. **Database history.** Neon's restore history and branching show the database as it was at any moment during voting. Anyone with Neon console access can replay the order of writes. Restore history covering the voting window must be shortened or reset after the tally, and console access limited.
3. **Key handling.** If the committee's private key is entered into server code, the people who deploy that code can read every ballot. Decryption and tally should happen offline or in the committee's browser; the server should never see the private key or individual plaintext ballots.
4. **Who holds which role.** The technical lead and the Neon owner must not also be keyholders or election officers.
5. **Remote-vote credential.** A self-registration using someone else's FWO with the registrant's own phone could become a remote-voting credential. **Accepted risk (requirements D27):** online voting needs only FWO + phone OTP, from anywhere. It is detected, not prevented: the real member's registration is flagged (BR-03), and a member told they have already voted is directed to the election officer.

### Open decisions

| # | Decision | Options |
|---|---|---|
| E1 | How does a remote voter prove they are themselves? | **Resolved (D20, D21):** every phone number belongs to exactly one member. Members with a phone vote online with FWO + phone OTP and a declaration that they are voting for themselves. Members without a personal phone vote manually on election day: an officer checks them in, which records their participation, then hands them a paper ballot. Paper totals are entered per position by the presiding officer and confirmed by a second officer. Superseded proposal, kept for history: **risk-based voting.** A member whose phone number belongs to no other member in the registry votes remotely with FWO + phone OTP. A member whose phone is shared with another member votes in person on election day (officer recognises them and issues a one-time ballot code), or first registers a phone of their own through the office. No PIN. Shared status is computed when the electorate is frozen. Phone numbers can only be changed by staff, with audit. Every remote voter confirms a declaration that they are voting for themselves. Rejected: in-person PIN for everyone (too much work); FWO + OTP for everyone (one family phone could vote for the whole household). |
| E2 | Voting window | Resolved: a few hours on election day. Exact opening and closing times are set per election by the election officer. |
| E3 | Candidacy rules | Resolved: one position per person; unopposed candidates elected without a vote; voters may abstain on any position; a tie for first place triggers a re-run between only the tied candidates (see below). |
| E4 | Department electorates | Resolved: department leaders confirm rosters before nominations close. Requires a roster confirmation screen before the 24 January department elections. |
| E5 | Parish (PCC) elections | Some PCC seats are elected (People's Warden, possibly executive office bearers), others are appointed (Vicar's Warden) or held by right of office (clergy). The system runs only elected seats; positions carry `filled_by` = `ELECTION` or `APPOINTMENT`. The exact list must come from the ACK Constitution and Diocese of Mombasa rules as applied in this parish, confirmed by the Vicar, not from a generic summary. |
| E6 | Electorate cut-off | Resolved: a member is eligible only if approved before nominations open. |

### Re-runs

If two or more candidates share the highest vote count for a position, a re-run is held for that position only, between only the tied candidates. Other candidates for that position drop out.

A re-run is modelled as a new Election (`kind = RERUN`, `parent_election_id` set) containing that single position and the tied candidates. It reuses the parent's frozen electorate, so the same people are eligible and each can vote once more. Results of the other positions in the parent election stand. Re-runs repeat until a single winner emerges.
