# Database Design — Release 1 (Registration)

| | |
|---|---|
| Status | v0.2 — privileges amended 24 Nov 2026 (credentials hidden from `readonly_ops`; Better Auth deletes; audit insert columns) |
| Date | 24 November 2026 |
| Database | PostgreSQL 17 on Neon, EU (Frankfurt) region (ADR 0002) |
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
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  version                 integer NOT NULL DEFAULT 0,
  CHECK (status = 'ACTIVE' OR status_reason IS NOT NULL)
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
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_challenge_rate_idx ON phone_challenge (phone_e164, created_at);

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
-- Better Auth generates: "user", session, account, verification, two_factor, passkey.
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

-- ---------------------------------------------------------------- rate limiting
CREATE TABLE rate_limit_bucket (
  key           text NOT NULL,          -- e.g. 'otp:phone:<hmac>' or 'form:ip:<hmac>'
  window_start  timestamptz NOT NULL,
  count         integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
```

OTP codes are never stored, only `code_hash` (HMAC-SHA256 with a server secret). Rate-limit keys are HMAC-SHA256 of the phone number or IP with a server secret (a plain hash of a phone number can be reversed by trying every number), so the table holds no readable personal data.

## 3. Rules enforced outside constraints

| Rule | Where |
|---|---|
| Registrations start `SUBMITTED`; a final registration (APPROVED, REJECTED, WITHDRAWN) never changes status, `decided_at` or `member_id`; `decided_at` is the database clock; reference, channel and capturing officer never change (domain-model invariant 7) | `registration_guard` trigger (migration `0001_constraints.sql`) |
| Every member has at least one open HBC assignment | `membership.approve()` creates it in the same transaction; integration test asserts no member without an open assignment |
| The capturing officer cannot approve (BR-10) | Application service check, plus authorisation test |
| HBC and department must be active on new registrations | Application validation |
| Every state change writes an audit entry | Application service, in the same transaction; integration tests per action |
| Optimistic concurrency on review actions | `UPDATE … WHERE id = $1 AND version = $2`, zero rows updated = conflict |

## 4. Database roles and privileges

| Role | Used by | Privileges |
|---|---|---|
| `app_owner` | Migrations only (CI deploy step) | Owns all objects |
| `app_runtime` | The application and background jobs | `SELECT, INSERT` on all tables; `UPDATE` on mutable tables only; no `UPDATE` or `DELETE` on `audit_entry`, `registration_revision`, `registration_decision`, `verification_evidence`; `DELETE` only on `phone_challenge`, `rate_limit_bucket`, `sms_outbox` and Better Auth's `session`, `verification`, `account`, `two_factor`, `passkey` (expired sessions and second-factor resets); `INSERT` on `audit_entry` and `registration_decision` only for content columns, so the application cannot set `at` or `redacted_at`; `UPDATE` on `registration` only for review-workflow columns (not `reference`, `channel`, `captured_by_user_id`, `created_at`, `personal_data_redacted_at`) |
| `readonly_ops` | Super Administrators for investigations | `SELECT` only, except staff credentials (`account`, `session`, `verification`, `two_factor`, `passkey`); every session is logged by the provider |

```sql
REVOKE UPDATE, DELETE ON audit_entry, registration_revision,
                         registration_decision, verification_evidence FROM app_runtime;
REVOKE INSERT ON audit_entry, registration_decision FROM app_runtime;
GRANT INSERT (actor_type, actor_id, action, entity_type, entity_id, before, after, request_id)
  ON audit_entry TO app_runtime;
GRANT INSERT (registration_id, action, reason, actor_user_id) ON registration_decision TO app_runtime;
REVOKE SELECT ON account, session, verification, two_factor, passkey FROM readonly_ops;
```

The full set of grants is in `src/db/migrations/0002_privileges_and_redaction.sql`.

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

Seeds for staff users are never committed. The first Super Administrator is created with a one-off CLI command on the server.

## 6. Housekeeping jobs (Cloudflare Cron Triggers and Queues, ADR 0002)

Neon suspends compute after 5 idle minutes and bills by the hour awake. A job that touches the database every minute would keep it awake all month (about 180 CU-hours, more than the Free plan's 100). So jobs touch the database only when there is work, or once a day.

| Job | Schedule | Action |
|---|---|---|
| `sms.dispatch` | Immediately after each write (in the same request, after commit); retries through a Cloudflare Queue with delays | Send the PENDING row; on failure enqueue a delayed retry with backoff; mark FAILED after 5 attempts |
| `sms.sweep` | Daily | Re-enqueue PENDING rows older than 15 minutes (safety net if a retry was lost) |
| `otp.purge` | Daily | Delete `phone_challenge` rows older than 24 hours |
| `ratelimit.purge` | Daily | Delete expired buckets |
| `sms.purge` | Daily | Delete outbox rows older than 90 days |
| `retention.redact` | Daily | Call `redact_expired_registration` for each eligible registration |
