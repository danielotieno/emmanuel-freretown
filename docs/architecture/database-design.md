# Database Design — Release 1 (Registration)

| | |
|---|---|
| Status | v0.2 — privileges amended 24 Nov 2026 (credentials hidden from `readonly_ops`; Better Auth deletes; audit insert columns) |
| Date | 24 November 2026 |
| Database | PostgreSQL 18 on Neon, EU (Frankfurt) region (ADR 0002) |
| Related | `docs/architecture/domain-model.md` §3 |

This document is the source of truth for constraints. The Drizzle schema is written from it. Anything Drizzle cannot express (exclusion constraints, partial unique indexes with `NULLS NOT DISTINCT`, functions, grants) goes into a hand-written migration created with `drizzle-kit generate --custom`.

Election tables are designed in Release 2 and are not included here.

## 1. Conventions

- Primary keys: `uuid DEFAULT gen_random_uuid()`, except Better Auth tables (text ids) and `audit_entry` (identity bigint).
- Timestamps: `timestamptz`, stored in UTC, displayed in Africa/Nairobi.
- Statuses: `text` with `CHECK` constraints rather than Postgres enums, so values can be added and removed in ordinary migrations.
- Names: snake_case, singular table names.
- Phone format: E.164 Kenyan mobile, `^\+254[17][0-9]{8}$`.
- FWO format: digits only, `^[0-9]+$`, stored as text.

## 2. Schema

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------- organisation
CREATE TABLE hbc (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hbc_name_uq ON hbc (lower(name));

CREATE TABLE department (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX department_name_uq ON department (lower(name));

-- ---------------------------------------------------------------- membership
-- One import of the parish list (D47, FR-13). Immutable: a record of who imported how many
-- rows, on whose consent confirmation. Never the file or any row's contents.
CREATE TABLE member_import (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by_user_id     text NOT NULL,
  consent_confirmed_on    date NOT NULL,        -- the date of the Vicar's confirmation (BR-15)
  privacy_notice_version  text NOT NULL,
  rows_imported           integer NOT NULL CHECK (rows_imported > 0),
  rows_skipped            integer NOT NULL CHECK (rows_skipped >= 0),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE member (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fwo_number              text NOT NULL CHECK (fwo_number ~ '^[0-9]+$'),
  full_name               text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 120),
  phone_e164              text CHECK (phone_e164 ~ '^\+254[17][0-9]{8}$'),   -- null = no personal phone
  status                  text NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','INACTIVE','DECEASED','TRANSFERRED_OUT')),
  status_reason           text,
  language                text NOT NULL DEFAULT 'sw' CHECK (language IN ('en','sw')),
  source_registration_id  uuid,            -- FK added below
  import_id               uuid REFERENCES member_import(id),   -- D47: imported, not approved
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 integer NOT NULL DEFAULT 0,
  CHECK (status = 'ACTIVE' OR status_reason IS NOT NULL),
  -- Approved from a registration or imported, never both.
  CHECK (source_registration_id IS NULL OR import_id IS NULL)
);
CREATE UNIQUE INDEX member_fwo_uq ON member (fwo_number);       -- D2: unique forever
-- D20: one phone number per member. Deceased and transferred members release their
-- number, because Kenyan operators recycle numbers and families inherit phones.
CREATE UNIQUE INDEX member_phone_uq ON member (phone_e164)
  WHERE phone_e164 IS NOT NULL AND status IN ('ACTIVE','INACTIVE');

CREATE TABLE member_hbc_assignment (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES member(id),
  hbc_id      uuid NOT NULL REFERENCES hbc(id),
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_to    timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  EXCLUDE USING gist (member_id WITH =, tstzrange(valid_from, valid_to) WITH &&)
);
CREATE UNIQUE INDEX member_hbc_one_open_uq
  ON member_hbc_assignment (member_id) WHERE valid_to IS NULL;
CREATE INDEX member_hbc_by_hbc_idx ON member_hbc_assignment (hbc_id) WHERE valid_to IS NULL;

CREATE TABLE department_membership (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES member(id),
  department_id         uuid NOT NULL REFERENCES department(id),
  state                 text NOT NULL CHECK (state IN ('DECLARED','CONFIRMED')),
  valid_from            timestamptz NOT NULL DEFAULT now(),
  valid_to              timestamptz,
  confirmed_by_user_id  text,
  confirmed_at          timestamptz,
  CHECK (valid_to IS NULL OR valid_to > valid_from),
  CHECK ((state = 'CONFIRMED') = (confirmed_at IS NOT NULL AND confirmed_by_user_id IS NOT NULL)),
  EXCLUDE USING gist (member_id WITH =, department_id WITH =,
                      tstzrange(valid_from, valid_to) WITH &&)
);

-- ---------------------------------------------------------------- registration
CREATE TABLE registration (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference                  text NOT NULL CHECK (reference ~ '^REG-[2-9A-HJ-NP-Z]{5}$'),
  channel                    text NOT NULL CHECK (channel IN ('SELF','ASSISTED')),
  status                     text NOT NULL DEFAULT 'SUBMITTED'
                             CHECK (status IN ('SUBMITTED','CORRECTION_REQUESTED',
                                               'APPROVED','REJECTED','WITHDRAWN')),
  language                   text NOT NULL CHECK (language IN ('en','sw')),
  current_revision_no        integer NOT NULL DEFAULT 1,
  captured_by_user_id        text,
  event_label                text,
  fwo_conflict               boolean NOT NULL DEFAULT false,
  phone_conflict             boolean NOT NULL DEFAULT false,      -- BR-06
  member_id                  uuid REFERENCES member(id),
  decided_at                 timestamptz,
  personal_data_redacted_at  timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  version                    integer NOT NULL DEFAULT 0,       -- optimistic concurrency
  CHECK ((channel = 'ASSISTED') = (captured_by_user_id IS NOT NULL)),
  CHECK ((status = 'APPROVED') = (member_id IS NOT NULL)),
  CHECK ((status IN ('APPROVED','REJECTED','WITHDRAWN')) = (decided_at IS NOT NULL)),
  CHECK (personal_data_redacted_at IS NULL OR status IN ('REJECTED','WITHDRAWN'))
);
CREATE UNIQUE INDEX registration_reference_uq ON registration (reference);
CREATE INDEX registration_queue_idx ON registration (status, created_at);

ALTER TABLE member
  ADD CONSTRAINT member_source_registration_fk
  FOREIGN KEY (source_registration_id) REFERENCES registration(id);

CREATE TABLE registration_revision (
  registration_id         uuid NOT NULL REFERENCES registration(id),
  revision_no             integer NOT NULL CHECK (revision_no >= 1),
  full_name               text CHECK (full_name IS NULL OR length(btrim(full_name)) BETWEEN 2 AND 120),
  fwo_number              text CHECK (fwo_number IS NULL OR fwo_number ~ '^[0-9]+$'),
  phone_e164              text CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+254[17][0-9]{8}$'),
  hbc_id                  uuid REFERENCES hbc(id),
  adult_declared          boolean NOT NULL CHECK (adult_declared),
  transfer_consent        boolean NOT NULL CHECK (transfer_consent),   -- BR-15
  is_new_member           boolean NOT NULL DEFAULT false,              -- BR-16
  no_personal_phone       boolean NOT NULL DEFAULT false,              -- BR-06, assisted only
  privacy_notice_version  text NOT NULL,
  submitted_by_user_id    text,                      -- null for self-registration
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  redacted_at             timestamptz,
  PRIMARY KEY (registration_id, revision_no),
  CHECK (NOT (no_personal_phone AND phone_e164 IS NOT NULL)),
  CHECK (NOT no_personal_phone OR submitted_by_user_id IS NOT NULL),   -- only officers record it
  CHECK (redacted_at IS NOT NULL OR
         (full_name IS NOT NULL AND hbc_id IS NOT NULL
          AND (phone_e164 IS NOT NULL OR no_personal_phone)
          AND (fwo_number IS NOT NULL OR is_new_member)))
);
-- The Secretary enters the newly issued FWO as a new revision before approval.
-- member.fwo_number stays NOT NULL, so an approved member always has one.
CREATE INDEX registration_revision_fwo_idx ON registration_revision (fwo_number);

CREATE TABLE registration_revision_department (
  registration_id  uuid NOT NULL,
  revision_no      integer NOT NULL,
  department_id    uuid NOT NULL REFERENCES department(id),
  PRIMARY KEY (registration_id, revision_no, department_id),
  FOREIGN KEY (registration_id, revision_no)
    REFERENCES registration_revision(registration_id, revision_no)
);

CREATE TABLE registration_decision (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id  uuid NOT NULL REFERENCES registration(id),
  action           text NOT NULL
                   CHECK (action IN ('APPROVE','REJECT','REQUEST_CORRECTION','WITHDRAW')),
  reason           text,
  actor_user_id    text NOT NULL,
  at               timestamptz NOT NULL DEFAULT now(),
  CHECK (action = 'APPROVE' OR reason IS NOT NULL)
);
CREATE INDEX registration_decision_reg_idx ON registration_decision (registration_id, at);

-- ---------------------------------------------------------------- verification
CREATE TABLE phone_challenge (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text NOT NULL CHECK (phone_e164 ~ '^\+254[17][0-9]{8}$'),
  purpose      text NOT NULL CHECK (purpose IN ('REGISTRATION','STATUS_CHECK')),
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at   timestamptz NOT NULL,
  verified_at  timestamptz,                 -- the right code was entered (#15)
  token_hash   text,                        -- HMAC of the single-use verification token
  consumed_at  timestamptz,                 -- the token was redeemed by a submission
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((verified_at IS NULL) = (token_hash IS NULL)),
  CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
);
CREATE INDEX phone_challenge_rate_idx ON phone_challenge (phone_e164, created_at);
CREATE UNIQUE INDEX phone_challenge_token_uq ON phone_challenge (token_hash);

CREATE TABLE verification_evidence (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id  uuid NOT NULL REFERENCES registration(id),
  kind             text NOT NULL
                   CHECK (kind IN ('PHONE_OTP','IN_PERSON','FWO_CONFIRMED_BY_SECRETARY')),
  phone_e164       text,
  actor_user_id    text,
  event_label      text,
  at               timestamptz NOT NULL DEFAULT now(),
  redacted_at      timestamptz,
  CHECK (kind <> 'PHONE_OTP' OR phone_e164 IS NOT NULL OR redacted_at IS NOT NULL),
  CHECK (kind = 'PHONE_OTP' OR actor_user_id IS NOT NULL)
);
CREATE INDEX verification_evidence_reg_idx ON verification_evidence (registration_id);

-- ---------------------------------------------------------------- access
-- Better Auth generates: "user", session, account, verification, two_factor, staff_rate_limit
-- (pnpm auth:schema, from src/modules/access/auth.ts). session.two_factor_verified is ours: true
-- only for a session created after an authenticator or backup code, and requireStaff refuses
-- any other (#17). staff_rate_limit is Better Auth's rate-limit store (key = IP and path).
-- No passkey table: the second factor is an authenticator app (FR-10, #17).
-- Self sign-up is disabled in Better Auth config; Super Administrators create staff users.

CREATE TABLE role_assignment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             text NOT NULL REFERENCES "user"(id),
  role                text NOT NULL
                      CHECK (role IN ('SUPER_ADMIN','MEMBERSHIP_ADMIN','REGISTRATION_OFFICER')),
  scope_type          text NOT NULL DEFAULT 'GLOBAL'
                      CHECK (scope_type IN ('GLOBAL','HBC','DEPARTMENT')),
  scope_id            uuid,
  granted_by_user_id  text NOT NULL,
  granted_at          timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  CHECK ((scope_type = 'GLOBAL') = (scope_id IS NULL))
);
CREATE UNIQUE INDEX role_assignment_active_uq
  ON role_assignment (user_id, role, scope_type, scope_id) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------- audit
CREATE TABLE audit_entry (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_type   text NOT NULL CHECK (actor_type IN ('STAFF','PUBLIC','SYSTEM')),
  actor_id     text,
  action       text NOT NULL,                 -- e.g. 'registration.approve'
  entity_type  text NOT NULL,
  entity_id    text NOT NULL,
  before       jsonb,
  after        jsonb,
  request_id   text,
  redacted_at  timestamptz
);
CREATE INDEX audit_entry_entity_idx ON audit_entry (entity_type, entity_id, at);
CREATE INDEX audit_entry_actor_idx ON audit_entry (actor_id, at);

-- ---------------------------------------------------------------- notifications
CREATE TABLE sms_outbox (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164           text NOT NULL CHECK (phone_e164 ~ '^\+254[17][0-9]{8}$'),
  template             text NOT NULL,          -- e.g. 'registration.submitted'
  language             text NOT NULL CHECK (language IN ('en','sw')),
  params               jsonb NOT NULL DEFAULT '{}',   -- reference and status only; never names
  status               text NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED')),
  attempts             integer NOT NULL DEFAULT 0,
  provider_message_id  text,
  last_error           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  sent_at              timestamptz,
  delivered_at         timestamptz
);
CREATE INDEX sms_outbox_pending_idx ON sms_outbox (created_at) WHERE status = 'PENDING';

-- SMS settings administrators can change (D25), seeded by migration 0005:
-- daily_cap = 1000, low_balance_units = 1500.
CREATE TABLE sms_setting (
  key                 text PRIMARY KEY CHECK (key IN ('daily_cap','low_balance_units')),
  value               integer NOT NULL CHECK (value >= 0),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id  text
);

-- SMS sent per Africa/Nairobi day, OTP codes included, for the daily cap (D25).
CREATE TABLE sms_daily_usage (
  day   date PRIMARY KEY,
  sent  integer NOT NULL DEFAULT 0 CHECK (sent >= 0)
);

-- ---------------------------------------------------------------- rate limiting
CREATE TABLE rate_limit_bucket (
  key           text NOT NULL,          -- e.g. 'otp:phone:<hmac>' or 'form:ip:<hmac>'
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
```

OTP codes are never stored, only `code_hash` (HMAC-SHA256 with a server secret). Rate-limit keys are HMAC-SHA256 of the phone number or IP with a server secret (a plain hash of a phone number can be reversed by trying every number), so the table holds no readable personal data.

**Rate limits (#13).** `rate_limit_bucket` is a sliding log: each allowed attempt adds a row at its own timestamp, and a check sums the rows of the last window. The verification module checks a request's limits together, in one transaction, under advisory locks on their keys taken in a fixed order: either every limit has room and each counts the attempt, or none counts it, so concurrent requests never get more than a limit through and a refused request uses up nothing. The OTP limits are FR-2's (3 per phone per hour, a resend after 60 seconds) plus 20 per IP per hour (60 per officer per hour instead, at the officer desk, #18); an IPv6 address counts by its /64, which one client normally controls. Many phones share an IP (mobile carriers, church Wi-Fi), hence the generous IP limit; Turnstile runs before all of them.

**Daily SMS cap (D25).** Every SMS calls `reserveSms` (notifications module), which raises today's `sms_daily_usage.sent` in one statement only while it is under `sms_setting.daily_cap`. At the cap OTP sending pauses (the public sees the normal message) and outbox messages stay PENDING until the next day's `sms.sweep`. The one request that reaches 80% and the one that reaches the cap each send a warning to Sentry, which alerts staff. An outbox message counts on its first attempt only. The statement locks today's row until its transaction ends, so it never runs inside a transaction that also calls the provider; otherwise every SMS would wait for the slowest send.

**Phone OTP (#15, FR-2).** `requestPhoneChallenge` (verification module) refuses a number that isn't a Kenyan mobile, then checks Turnstile, then the rate limits, before anything is stored or sent. Each send creates a challenge valid for 5 minutes (database clock). Once its SMS is sent, it expires any earlier unverified challenge for the same phone and purpose, so only the newest code works; if the send fails or the daily cap pauses it, the code the member already has keeps working. The 6-digit code comes from the platform's secure random source and is stored as `code_hash` = HMAC-SHA256(`OTP_SECRET`, challenge id and code); it exists otherwise only in memory and in the SMS, and is never logged. `verifyPhoneChallenge` locks the row, compares in constant time and counts each wrong or malformed code; after 5 attempts even the right code is refused. An expired or already verified challenge is refused without using an attempt. A correct code sets `verified_at` and returns a random single-use token, stored only as `token_hash`. A token is spent in one `UPDATE … WHERE consumed_at IS NULL`, for the same phone and purpose, within 15 minutes of verification, inside the transaction that submits the form: a failed submission leaves it usable, a committed one spends it. For a registration, `redeemRegistrationVerification` spends a REGISTRATION token and, only if that succeeds, writes `PHONE_OTP` evidence and a `registration.verify_phone` audit entry, so evidence can't exist without a spent token for that phone. For the status check, `redeemStatusCheckVerification` spends a STATUS_CHECK token. Sending, checking and redeeming are not audited themselves (domain-model.md §3, "Not audited").

**Self-registration (#16, FR-1).** `submitSelfRegistration` (registration module) stores everything in one transaction: the registration (SUBMITTED, SELF, a random `REG-XXXXX` reference from an alphabet without 0, O, 1 and I, drawn again on a collision), revision 1 with the declarations and `privacy_notice_version`, the declared departments, the spent REGISTRATION token with its `PHONE_OTP` evidence, a `registration.submit` audit entry and the confirmation SMS in the outbox (sent after the response). `fwo_conflict` is set when the FWO belongs to a member (any status) or to another SUBMITTED or CORRECTION_REQUESTED registration's current revision (BR-03); `phone_conflict` when the phone belongs to an ACTIVE or INACTIVE member (BR-06). Both checks go through the membership module, and the public sees the same result either way. The audit entry records the flags and counts, not a second copy of the personal details, which are in the revision.

**Assisted registration (#18, FR-3).** `submitAssistedRegistration` (registration module) stores the same records as self-registration in one transaction, through the same helpers (`intake.ts`): channel ASSISTED with `captured_by_user_id` (the officer) and `event_label`; revision 1 with `submitted_by_user_id` set to the officer and `no_personal_phone` when the member has no phone of their own (BR-06: then no phone number and no SMS). Evidence follows FR-3: with the member's phone at the desk, the officer sends a code (counted against the officer's hourly limit, 60, instead of the per-IP one, plus FR-2's per-phone limits, after Turnstile) and `redeemRegistrationVerification` spends it as `PHONE_OTP` with the officer as actor; without the phone, or with no personal phone, `recordInPersonVerification` writes `IN_PERSON` evidence (officer, event, no phone number: the number, if any, stays unverified) and a `registration.verify_in_person` audit entry. A phone that wasn't at the desk still gets the confirmation SMS, at a number no code has checked, so that submission first passes `checkDeskSms` (rule 8): Turnstile, then the officer's and the phone's hourly limits, shared with the codes. The `registration.submit` audit entry has the officer as actor and records the verification method and the officer's confirmations (read-back, verbal consent), not the details. Conflicts are flagged as for self-registration and never shown to the officer. The unfinished form is kept only in the officer's browser tab (sessionStorage), never on the server. The desk draws a random uuid per member, kept with that form, and it becomes `registration.id`: a retry after a lost response finds the stored registration (`findAssistedSubmission`, the capturing officer's only) and gets the same reference, and a copy that races past that check fails on `registration_pkey` and is answered from the stored row. No second registration, audit entry or SMS.

**Review and approval (#19, FR-4).** The queue (`listReviewQueue`, registration module) lists SUBMITTED registrations oldest first with FR-4's filters (HBC, channel, the FWO-conflict, phone-conflict and new-member flags, event); viewing it is not recorded (D31). `openRegistrationForReview` records `registration.view` before returning anything. Each decision runs in one transaction that locks the registration row (`SELECT … FOR UPDATE`) and requires the status SUBMITTED and the version the reviewer saw, so a concurrent decision waits and then fails as stale with a plain message; the update itself is also `WHERE version = $seen`. Approval (`approveRegistration`) refuses the capturing officer (BR-10), a registration with no FWO number (BR-16), a deactivated HBC or department, an FWO held by a member or by another open registration (BR-03: the reviewer sees its reference and rejects the duplicate first), and a phone held by a member: all *now*, checked again, whatever the flags said at submission. It then creates the member through the membership module (`createMember`: the member, one open HBC period, DECLARED departments, a `member.create` audit entry), whose insert runs in a savepoint so `member_fwo_uq` or `member_phone_uq` (a race those checks can't see) come back as the same plain refusals. It sets the registration APPROVED with its member (the trigger sets `decided_at`), writes the decision and `registration.approve`, and queues the approval SMS. Reject and request-correction need a reason (3–500 characters, staff only), kept after retention redaction (BR-14), so the forms tell staff not to write names, phone or FWO numbers in it; a correction request queues the correction SMS, a rejection sends none (FR-8). A member with no personal phone gets no SMS. Decisions are inserted naming only the columns app_runtime may insert (`registration_id, action, reason, actor_user_id`), as `audit.write` does, because Drizzle's `insert()` would also name `id` and `at`.

**Import of the parish list (#104, FR-13, D47).** A Membership Administrator uploads a CSV file at `/members/import` on the staff host. The file is read in memory and never stored: `parseMemberCsv` (membership module) reads RFC 4180 CSV in UTF-8, with commas or semicolons, and `checkImportRows` checks every row against the rules and the database: FWO number digits only (BR-01) and held by no member (BR-02); name 2–120 characters; phone blank (no personal phone) or a Kenyan mobile held by no active or inactive member (BR-06, D20); an active HBC (BR-04) and active departments (BR-05), matched by name ignoring case and spaces around it, never guessed; language `en` or `sw`, English when blank (D44). Rows sharing an FWO number or a phone within the file are all skipped: the file can't say which is right. The preview lists every skipped row's number and rule; nothing is stored. Confirming sends the same file again with the SHA-256 digest and the count the preview showed, the date of the Vicar's consent confirmation and the tick; `importMembers` checks every row again and refuses if the file or the count changed. It then writes, in one transaction: one `member_import` row; every valid row as an ACTIVE member with `import_id`, its open HBC period and DECLARED departments, in bulk statements; a `member.create` audit entry per member (`importId`, HBC, number of departments, no personal phone) and one `member_import.create` entry with the counts. A FWO number or phone taken between the checks and the insert fails the unique index, and the whole import rolls back with a plain message to preview again. No SMS is sent. Phones are not marked as checked: the member table records no phone verification. Nothing from the file reaches the logs or error reports; refusals name a row number and a rule only.

**Status check (#20, FR-7, D24, D48).** The page at `/registration/status` asks for a phone and an FWO number or reference (`parseStatusKey`: digits kept exactly as typed, D29; a reference in any case), sends a STATUS_CHECK code through `requestPhoneChallenge` (Turnstile and the rate limits, rule 8), and only after the code is verified calls `checkRegistrationStatus` (registration module). It spends the token with `redeemStatusCheckVerification` and reads the record in the same transaction, so one code buys one answer and every guess at another number costs a new code. Matching, in order: an ACTIVE member with this phone and FWO number, approved or imported (`findActiveMemberForStatusCheck`, membership module): "Registered member"; otherwise the newest registration whose current revision has this phone and this FWO number or reference (given a reference, the member check runs first with that registration's FWO number, so a member always sees their member record whichever number they give): SUBMITTED is "Received", CORRECTION_REQUESTED, REJECTED and WITHDRAWN are "contact the church office", APPROVED is the member it created if still ACTIVE with this phone. Everything else, including inactive, deceased and transferred members and redacted registrations (no phone left), is the one same "not found" answer. A match shows the name and current HBC (D48), never the phone or departments. Nothing is audited (the reader is the member, not staff, and nothing changes but the token); logs carry the outcome only. The page is sent with `Cache-Control: no-store` (middleware) and keeps what was typed in the form posts, never the URL.

**OTP codes never go through the outbox.** The outbox keeps its parameters in the database until purged, and codes are stored only as a hash (rule 8). An OTP is sent directly through the provider after `reserveSms`; if it fails, the member asks for a new code. Every other SMS (FR-8) goes through the outbox.

## 3. Rules enforced outside constraints

| Rule | Where |
|---|---|
| Registrations start `SUBMITTED`; a final registration (APPROVED, REJECTED, WITHDRAWN) never changes status, `decided_at` or `member_id`; `decided_at` is the database clock; reference, channel and capturing officer never change (domain-model invariant 7) | `registration_guard` trigger (migration `0001_constraints.sql`) |
| Every member has at least one open HBC assignment | `createMember` (membership module), called by `approveRegistration`, creates it in the same transaction; integration test asserts no member without an open assignment |
| The capturing officer cannot approve (BR-10) | `approveRegistration` (registration module), integration and Playwright tests |
| HBC and department must be active on new registrations | Application validation: `checkUnitsForRegistration` in the organisation module, called inside the registration transaction |
| Every state change writes an audit entry | Application service, in the same transaction; integration tests per action |
| SMS go only to Kenyan mobile numbers | CHECK on every phone column, plus `normalizeKenyanPhone` (verification) before any rate limit, Turnstile check or SMS is spent |
| Optimistic concurrency on review actions | Row lock, then `UPDATE … WHERE id = $1 AND version = $2`; a changed version or zero rows updated = stale (#19) |

## 4. Database roles and privileges

| Role | Used by | Privileges |
|---|---|---|
| `app_owner` | Migrations only (CI deploy step) | Owns all objects |
| `ack_app` (login) | The application, through Hyperdrive, and local development | Member of `app_runtime` only; owns nothing; not superuser, no `CREATEROLE` or `CREATEDB`. Created or rotated with `pnpm db:app-login` (`docs/operations/environments.md`) |
| `ack_backup` (login) | Nightly backup and weekly drift check (GitHub Actions) | Member of `pg_read_all_data` only: reads every table, including staff credentials so a restore is complete; writes nothing; owns nothing. Created or rotated with `pnpm db:backup-login` (`docs/operations/backups-and-rollback.md`) |
| `app_runtime` | The application and background jobs | `SELECT, INSERT` on all tables; `UPDATE` on mutable tables only (including `sms_setting` and `sms_daily_usage`, migration 0005); no `UPDATE` or `DELETE` on `audit_entry`, `registration_revision`, `registration_decision`, `verification_evidence`, `member_import`; `DELETE` only on `phone_challenge`, `rate_limit_bucket`, `sms_outbox` and Better Auth's `session`, `verification`, `account`, `two_factor`, `staff_rate_limit` (expired sessions, second-factor resets and expired rate-limit rows); `INSERT` on `audit_entry` and `registration_decision` only for content columns, so the application cannot set `at` or `redacted_at`; `UPDATE` on `registration` only for review-workflow columns (not `reference`, `channel`, `captured_by_user_id`, `created_at`, `personal_data_redacted_at`) |
| `readonly_ops` | Super Administrators for investigations | `SELECT` only, except staff credentials (`account`, `session`, `verification`, `two_factor`); every session is logged by the provider |

```sql
REVOKE UPDATE, DELETE ON audit_entry, registration_revision,
                         registration_decision, verification_evidence FROM app_runtime;
REVOKE INSERT ON audit_entry, registration_decision FROM app_runtime;
GRANT INSERT (actor_type, actor_id, action, entity_type, entity_id, before, after, request_id)
  ON audit_entry TO app_runtime;
GRANT INSERT (registration_id, action, reason, actor_user_id) ON registration_decision TO app_runtime;
-- member_import (#104) is a record of what happened: inserted, never changed.
GRANT SELECT, INSERT ON member_import TO app_runtime;
GRANT SELECT ON member_import TO readonly_ops;
REVOKE SELECT ON account, session, verification, two_factor FROM readonly_ops;
```

The full set of grants is in `src/db/migrations/0002_privileges_and_redaction.sql`.

Drizzle's `insert()` lists every column of the table and sends `DEFAULT` for the ones not given, so it cannot write `audit_entry` or `registration_decision` as `app_runtime`: the database refuses the columns `app_runtime` may not insert, such as `at`. Insert into these tables with an explicit column list instead, as `audit.write` does.

Retention redaction (BR-14) runs through one function owned by `app_owner`. The function checks eligibility itself, using only data the application cannot backdate, so the application role cannot use it to erase anything that isn't due:

- `registration.decided_at` is set by the `registration_guard` trigger from the database clock, and a final registration can never change status, decision time or member (§3);
- `registration_decision.at` cannot be written by `app_runtime` (column privileges);
- every table is schema-qualified and `pg_temp` is searched last, so a temporary table cannot stand in for a real one.

```sql
CREATE FUNCTION public.redact_expired_registration(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.registration r
     SET personal_data_redacted_at = now()
   WHERE r.id = p_registration_id
     AND r.status IN ('REJECTED','WITHDRAWN')
     AND r.decided_at < now() - interval '12 months'
     AND r.personal_data_redacted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.registration_decision d
        WHERE d.registration_id = r.id
          AND d.action IN ('REJECT','WITHDRAW')
          AND d.at < now() - interval '12 months');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration % is not eligible for redaction', p_registration_id;
  END IF;

  UPDATE public.registration_revision
     SET full_name = NULL, fwo_number = NULL, phone_e164 = NULL,
         hbc_id = NULL, redacted_at = now()
   WHERE registration_id = p_registration_id;

  DELETE FROM public.registration_revision_department WHERE registration_id = p_registration_id;

  UPDATE public.verification_evidence
     SET phone_e164 = NULL, redacted_at = now()
   WHERE registration_id = p_registration_id;

  UPDATE public.audit_entry
     SET before = NULL, after = NULL, redacted_at = now()
   WHERE entity_type = 'registration' AND entity_id = p_registration_id::text;

  INSERT INTO public.audit_entry (actor_type, action, entity_type, entity_id)
  VALUES ('SYSTEM', 'registration.redact', 'registration', p_registration_id::text);
END $$;

REVOKE ALL ON FUNCTION public.redact_expired_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redact_expired_registration(uuid) TO app_runtime;
```

## 5. Seed data (migration, idempotent)

```sql
INSERT INTO hbc (name, sort_order) VALUES
  ('Jordan',1), ('Judea',2), ('Galilaya',3), ('Samaria',4), ('Zion Leisure',5),
  ('Zion Bombolulu',6), ('Zion Freretown',7), ('Damascus',8), ('Jerusalem',9),
  ('Bethlehem B',10), ('Bethlehem A',11)
ON CONFLICT ((lower(name))) DO NOTHING;

INSERT INTO department (name, sort_order) VALUES
  ('Mother''s Union',1), ('KAMA / AMF',2), ('Kiswahili Choir',3), ('English Choir',4),
  ('KAYO',5), ('Children Ministry',6), ('Evangelism',7), ('G.F.S.',8)
ON CONFLICT ((lower(name))) DO NOTHING;
```

Seeds for staff users are never committed. The first Super Administrator is created with a one-off command run with the owner's connection string, `pnpm staff:bootstrap` (`docs/operations/environments.md` §8); it refuses once an active Super Administrator exists.

## 6. Housekeeping jobs (Cloudflare Cron Triggers and Queues, ADR 0002)

Neon suspends compute after 5 idle minutes and bills by the hour awake. A job that touches the database every minute would keep it awake all month (about 180 CU-hours, more than the Free plan's 100). So jobs touch the database only when there is work, or once a day.

| Job | Schedule | Action |
|---|---|---|
| `sms.dispatch` | Immediately after each write (in the same request, after commit); retries through a Cloudflare Queue with delays | Send the PENDING row; on failure enqueue a delayed retry with backoff; after the queue's 5 attempts the row stays PENDING for `sms.sweep` |
| `sms.sweep` | Daily | Re-enqueue PENDING rows older than 15 minutes, in batches of 100 (a lost retry, the daily retry after an outage, messages paused by yesterday's cap); mark rows PENDING for 7 days FAILED (`expired`) |
| `sms.balance` | Daily | Read the Mobile Sasa balance (SMS units); alert staff through Sentry when it is below `sms_setting.low_balance_units` |
| `otp.purge` | Daily | Delete `phone_challenge` rows older than 24 hours |
| `ratelimit.purge` | Daily | Delete expired buckets |
| `sms.purge` | Daily | Delete outbox rows older than 90 days |
| `retention.redact` | Daily | Call `redact_expired_registration` for each eligible registration |

The Worker entry is `src/jobs/worker.ts` (#10). The daily Cron Trigger (`0 1 * * *`, 04:00 in Mombasa) runs the jobs in `src/jobs/daily.ts` in turn, each with its own database handle. A failing job is logged and reported to Sentry, and the rest still run. All are implemented (#10, #13, #14). Jobs get the Worker's env and the queue binding, for the SMS secrets and the sweep. Queue messages carry `{ type, id }` only; the consumer acknowledges malformed or unknown messages and retries failed ones after 30 s, 1, 2 and 4 minutes: five attempts in all (`max_retries: 4`). A handler is told when it is on its last attempt, so it can record the failure (e.g. mark an SMS FAILED, as §6 requires).

**SMS sending (#14, D43).** `enqueueSms` writes the outbox row in the caller's transaction; after the commit, `sendNow` sends it from Next.js `after()` with a database handle of its own (the request's handle is closed by another `after()` task running at the same time), and on anything but a send queues `sms.dispatch` in 30 seconds; the queue then backs off (30 s, 1, 2, 4 minutes). A message is never lost to an outage (FR-8): a failure the provider may recover from (timeout, network, 5xx, balance, token) leaves the row PENDING, and after the queue's attempts the daily `sms.sweep` retries it each day. A row is FAILED only when the provider rejects the request (`0422`), a delivery report says undeliverable, or it has been PENDING for 7 days (`expired`). The row is locked (`FOR UPDATE SKIP LOCKED`) during a send, so a message is never sent twice at once. The outbox id goes to Mobile Sasa as the v2 `trackingId`; Mobile Sasa refuses the same text to the same number once it has been delivered that day (`0409`), which the outbox treats as sent. That stops most double sends on retry, though a retry while the first is still queued with the carrier can still go out. `last_error` holds only codes (`0422`, `http_502`, `timeout`, `expired`, a delivery status), never provider text. Account problems (balance, token, sender) alert staff through Sentry. The daily jobs run at 04:00 Nairobi time, so messages held by yesterday's cap reach members then.

**Delivery reports.** Mobile Sasa POSTs each delivery status to `/api/webhooks/sms-delivery`, signed with the webhook secret (`X-MobileSasa-Signature: t=…,v1=HMAC-SHA256("<t>.<raw body>")`). Reports with a bad signature or a timestamp more than 5 minutes off are refused (401) before anything is read. Delivered marks the row DELIVERED; Failed, Rejected, Expired and Unreachable mark a SENT row FAILED; a DELIVERED row never changes again. The body carries the member's phone number and is never logged. Delivery status changes are not audited: the outbox row is the record (FR-8), and it is purged after 90 days.
