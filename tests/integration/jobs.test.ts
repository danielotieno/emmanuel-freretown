import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { schema } from "../../src/db";
import { purgeExpiredStaffRows } from "../../src/modules/access";
import { redactClosedMembers, redactExpiredRegistrations } from "../../src/modules/audit";
import { purgeExpiredChallenges } from "../../src/modules/verification";
import { connectTestDb, pgErrorCode } from "./db";

// Daily jobs (issue #10, database-design.md §6) against real Postgres. Each test runs in a
// transaction that is rolled back. The jobs run as app_runtime, so the grants are tested too.

const client = connectTestDb();
const db = drizzle(client, { schema });

async function asApp<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("SET LOCAL ROLE app_runtime");
  try {
    return await fn();
  } finally {
    await client.query("RESET ROLE");
  }
}

async function challenge(age: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO phone_challenge (phone_e164, purpose, code_hash, expires_at, created_at)
     VALUES ('+254700000009', 'REGISTRATION', 'hash', now() - $1::interval + interval '5 minutes',
             now() - $1::interval)
     RETURNING id`,
    [age],
  );
  return rows[0]!.id;
}

describe("otp.purge", () => {
  it("deletes challenges older than 24 hours and keeps newer ones, idempotently", async () => {
    const old = await challenge("25 hours");
    const recent = await challenge("23 hours");

    expect(await asApp(() => purgeExpiredChallenges(db))).toBe(1);
    expect(await asApp(() => purgeExpiredChallenges(db))).toBe(0);

    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM phone_challenge WHERE id = ANY($1)",
      [[old, recent]],
    );
    expect(rows.map((r) => r.id)).toEqual([recent]);
  });
});

/** A registration rejected (or withdrawn) `age` ago, with one revision holding personal details. */
async function decided(reference: string, age: string, action = "REJECT"): Promise<string> {
  const status = action === "REJECT" ? "REJECTED" : "WITHDRAWN";
  // The guard trigger forbids backdating, rightly; switch it off for setup only.
  await client.query("ALTER TABLE registration DISABLE TRIGGER registration_guard");
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO registration (reference, channel, language, status, decided_at)
     VALUES ($1, 'SELF', 'sw', $2, now() - $3::interval) RETURNING id`,
    [reference, status, age],
  );
  await client.query("ALTER TABLE registration ENABLE TRIGGER registration_guard");
  const id = rows[0]!.id;
  await client.query(
    `INSERT INTO registration_decision (registration_id, action, reason, actor_user_id, at)
     VALUES ($1, $2, 'Test', 'staff-1', now() - $3::interval)`,
    [id, action, age],
  );
  const hbc = await client.query<{ id: string }>("SELECT id FROM hbc WHERE name = 'Jordan'");
  await client.query(
    `INSERT INTO registration_revision
       (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
        adult_declared, transfer_consent, privacy_notice_version)
     VALUES ($1, 1, 'Test Person', '8100', '+254700000010', $2, true, true, 'v1')`,
    [id, hbc.rows[0]!.id],
  );
  return id;
}

/** A registration approved 13 months ago (so linked to a member), with one revision. */
async function approvedLongAgo(reference: string): Promise<string> {
  const member = await client.query<{ id: string }>(
    "INSERT INTO member (fwo_number, full_name) VALUES ('8101', 'Test Person') RETURNING id",
  );
  await client.query("ALTER TABLE registration DISABLE TRIGGER registration_guard");
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO registration (reference, channel, language, status, decided_at, member_id)
     VALUES ($1, 'SELF', 'sw', 'APPROVED', now() - interval '13 months', $2) RETURNING id`,
    [reference, member.rows[0]!.id],
  );
  await client.query("ALTER TABLE registration ENABLE TRIGGER registration_guard");
  const id = rows[0]!.id;
  const hbc = await client.query<{ id: string }>("SELECT id FROM hbc WHERE name = 'Jordan'");
  await client.query(
    `INSERT INTO registration_revision
       (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
        adult_declared, transfer_consent, privacy_notice_version)
     VALUES ($1, 1, 'Test Person', '8101', '+254700000011', $2, true, true, 'v1')`,
    [id, hbc.rows[0]!.id],
  );
  return id;
}

async function redactedAt(id: string) {
  const { rows } = await client.query<{ at: Date | null; name: string | null }>(
    `SELECT r.personal_data_redacted_at AS at, v.full_name AS name
       FROM registration r JOIN registration_revision v ON v.registration_id = r.id
      WHERE r.id = $1`,
    [id],
  );
  return rows[0]!;
}

describe("retention.redact", () => {
  it("redacts registrations decided more than 12 months ago, idempotently, and audits each", async () => {
    const rejected = await decided("REG-JKBA2", "13 months");
    const withdrawn = await decided("REG-JKBA3", "13 months", "WITHDRAW");
    const recent = await decided("REG-JKBA4", "11 months");
    // Approved long ago: never selected (the status filter), so no nightly "failed: 1".
    const approved = await approvedLongAgo("REG-JKBA6");

    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 2, failed: 0 });
    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 0, failed: 0 });

    for (const id of [rejected, withdrawn]) {
      const row = await redactedAt(id);
      expect(row.at).not.toBeNull();
      expect(row.name).toBeNull();
    }
    expect(await redactedAt(recent)).toEqual({ at: null, name: "Test Person" });
    expect(await redactedAt(approved)).toEqual({ at: null, name: "Test Person" });

    const audit = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_entry
        WHERE action = 'registration.redact' AND entity_id = ANY($1)`,
      [[rejected, withdrawn]],
    );
    expect(audit.rows[0]!.n).toBe("2");
  });

  it("skips a registration whose decision record is not yet 12 months old", async () => {
    const id = await decided("REG-JKBA5", "13 months");
    await client.query("UPDATE registration_decision SET at = now() WHERE registration_id = $1", [
      id,
    ]);
    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 0, failed: 0 });
  });
});

/**
 * A member approved from a registration, edited, then marked `status` (DECEASED or
 * TRANSFERRED_OUT) `age` ago, as the application would record it: a member.change_status audit
 * entry at that time. As the owner, which may backdate audit entries; the application can't.
 */
async function closedMember(fwo: string, age: string, status = "DECEASED") {
  const hbc = await client.query<{ id: string }>("SELECT id FROM hbc WHERE name = 'Jordan'");
  const choir = await client.query<{ id: string }>(
    "SELECT id FROM department WHERE name = 'English Choir'",
  );
  const hbcId = hbc.rows[0]!.id;
  const departmentId = choir.rows[0]!.id;
  const phone = `+2547${fwo.padStart(8, "0")}`;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO member (fwo_number, full_name, phone_e164, language, status, status_reason)
     VALUES ($1, 'Test Former Member', $2, 'en', $3, 'Synthetic reason') RETURNING id`,
    [fwo, phone, status],
  );
  const memberId = rows[0]!.id;
  await client.query(
    `INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from)
     VALUES ($1, $2, now() - interval '3 years')`,
    [memberId, hbcId],
  );
  await client.query(
    `INSERT INTO department_membership (member_id, department_id, state, valid_from)
     VALUES ($1, $2, 'DECLARED', now() - interval '3 years')`,
    [memberId, departmentId],
  );

  // The registration it was approved from: a revision, its department and phone evidence.
  await client.query("ALTER TABLE registration DISABLE TRIGGER registration_guard");
  const reg = await client.query<{ id: string }>(
    `INSERT INTO registration (reference, channel, language, status, decided_at, member_id)
     VALUES ($1, 'SELF', 'en', 'APPROVED', now() - interval '3 years', $2) RETURNING id`,
    [`REG-${fwo.slice(-5).replace(/[01]/g, "A")}`, memberId],
  );
  await client.query("ALTER TABLE registration ENABLE TRIGGER registration_guard");
  const registrationId = reg.rows[0]!.id;
  await client.query("UPDATE member SET source_registration_id = $1 WHERE id = $2", [
    registrationId,
    memberId,
  ]);
  await client.query(
    `INSERT INTO registration_revision
       (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
        adult_declared, transfer_consent, privacy_notice_version)
     VALUES ($1, 1, 'Test Former Member', $2, $3, $4, true, true, 'v1')`,
    [registrationId, fwo, phone, hbcId],
  );
  await client.query(
    `INSERT INTO registration_revision_department (registration_id, revision_no, department_id)
     VALUES ($1, 1, $2)`,
    [registrationId, departmentId],
  );
  await client.query(
    `INSERT INTO verification_evidence (registration_id, kind, phone_e164)
     VALUES ($1, 'PHONE_OTP', $2)`,
    [registrationId, phone],
  );

  // The audit trail: an edit with personal values and a reason, then the status change.
  const entry = (
    action: string,
    entity: string,
    id: string,
    before: object | null,
    after: object,
    at: string,
  ) =>
    client.query(
      `INSERT INTO audit_entry (actor_type, actor_id, action, entity_type, entity_id, before, after, at)
       VALUES ('STAFF', 'staff-26', $1, $2, $3, $4, $5, now() - $6::interval)`,
      [action, entity, id, before && JSON.stringify(before), JSON.stringify(after), at],
    );
  await entry(
    "registration.submit",
    "registration",
    registrationId,
    null,
    { status: "SUBMITTED", fullName: "Test Former Member", departments: 1 },
    "3 years",
  );
  await entry(
    "member.edit",
    "member",
    memberId,
    {
      fullName: "Test Formr Member",
      phoneE164: "+254700000099",
      language: "sw",
      departmentIds: [],
    },
    {
      fullName: "Test Former Member",
      phoneE164: phone,
      language: "en",
      departmentIds: [departmentId],
      reason: "Misspelt",
    },
    "2 years",
  );
  await entry(
    "member.change_status",
    "member",
    memberId,
    { status: "ACTIVE" },
    { status, reason: "Synthetic reason" },
    age,
  );
  return { memberId, registrationId };
}

async function rowOf(query: string, id: string) {
  const { rows } = await client.query(query, [id]);
  return rows[0];
}

describe("retention.redact_members (D45)", () => {
  it("removes name, phone and departments a year after closing, keeping FWO, reasons and history", async () => {
    const { memberId, registrationId } = await closedMember("260001", "13 months");
    const transferred = await closedMember("260002", "13 months", "TRANSFERRED_OUT");

    expect(await asApp(() => redactClosedMembers(db))).toEqual({ redacted: 2, failed: 0 });
    expect(await asApp(() => redactClosedMembers(db))).toEqual({ redacted: 0, failed: 0 });

    expect(
      await rowOf(
        `SELECT fwo_number, full_name, phone_e164, status, status_reason, language,
                personal_data_redacted_at IS NOT NULL AS removed
           FROM member WHERE id = $1`,
        memberId,
      ),
    ).toEqual({
      fwo_number: "260001",
      full_name: null,
      phone_e164: null,
      status: "DECEASED",
      status_reason: "Synthetic reason",
      language: "en",
      removed: true,
    });
    expect(
      await rowOf(
        "SELECT count(*)::int AS n FROM department_membership WHERE member_id = $1",
        memberId,
      ),
    ).toEqual({ n: 0 });
    // The HBC history is kept (D45 doesn't list it).
    expect(
      await rowOf(
        "SELECT count(*)::int AS n FROM member_hbc_assignment WHERE member_id = $1",
        memberId,
      ),
    ).toEqual({ n: 1 });

    // The audit trail keeps its reasons and statuses; personal values go.
    const { rows: trail } = await client.query(
      `SELECT action, before, after, redacted_at IS NOT NULL AS redacted, actor_type
         FROM audit_entry WHERE entity_type = 'member' AND entity_id = $1 ORDER BY id`,
      [memberId],
    );
    expect(trail).toEqual([
      {
        action: "member.edit",
        before: { language: "sw" },
        after: { language: "en", reason: "Misspelt" },
        redacted: true,
        actor_type: "STAFF",
      },
      {
        action: "member.change_status",
        before: { status: "ACTIVE" },
        after: { status: "DECEASED", reason: "Synthetic reason" },
        redacted: true,
        actor_type: "STAFF",
      },
      { action: "member.redact", before: null, after: null, redacted: false, actor_type: "SYSTEM" },
    ]);

    // The registration it was approved from: revisions keep FWO and HBC, lose name and phone.
    expect(
      await rowOf(
        `SELECT full_name, phone_e164, fwo_number, hbc_id IS NOT NULL AS has_hbc,
                redacted_at IS NOT NULL AS redacted
           FROM registration_revision WHERE registration_id = $1`,
        registrationId,
      ),
    ).toEqual({
      full_name: null,
      phone_e164: null,
      fwo_number: "260001",
      has_hbc: true,
      redacted: true,
    });
    expect(
      await rowOf(
        "SELECT count(*)::int AS n FROM registration_revision_department WHERE registration_id = $1",
        registrationId,
      ),
    ).toEqual({ n: 0 });
    expect(
      await rowOf(
        "SELECT phone_e164 FROM verification_evidence WHERE registration_id = $1",
        registrationId,
      ),
    ).toEqual({ phone_e164: null });
    expect(
      await rowOf(
        "SELECT after FROM audit_entry WHERE entity_type = 'registration' AND entity_id = $1",
        registrationId,
      ),
    ).toEqual({ after: { status: "SUBMITTED", departments: 1 } });

    expect(await rowOf("SELECT full_name FROM member WHERE id = $1", transferred.memberId)).toEqual(
      { full_name: null },
    );

    // BR-02: the number is still held, so it can never be issued again.
    expect(
      await pgErrorCode(
        client,
        `INSERT INTO member (fwo_number, full_name) VALUES ('260001', 'Someone Else')`,
      ),
    ).toBe("23505");
  });

  it("leaves records not yet due, or closed without the audit entry that dates the change", async () => {
    const recent = await closedMember("260011", "11 months");
    const reopened = await closedMember("260012", "13 months");
    // A later status change: the latest entry no longer matches the record's closed status.
    await client.query(
      `INSERT INTO audit_entry (actor_type, actor_id, action, entity_type, entity_id, after)
       VALUES ('STAFF', 'staff-26', 'member.change_status', 'member', $1,
               '{"status": "INACTIVE", "reason": "Synthetic"}')`,
      [reopened.memberId],
    );
    const unrecorded = await closedMember("260013", "13 months");
    await client.query(
      "DELETE FROM audit_entry WHERE entity_id = $1 AND action = 'member.change_status'",
      [unrecorded.memberId],
    );

    expect(await asApp(() => redactClosedMembers(db))).toEqual({ redacted: 0, failed: 0 });
    for (const { memberId } of [recent, reopened, unrecorded]) {
      expect(await rowOf("SELECT full_name FROM member WHERE id = $1", memberId)).toEqual({
        full_name: "Test Former Member",
      });
    }
    // Called directly for one that isn't due, the function refuses.
    expect(
      await asApp(() =>
        pgErrorCode(client, "SELECT public.redact_closed_member($1)", [recent.memberId]),
      ),
    ).toBe("P0001");
  });

  it("lets only the function mark a member's details removed (column privileges)", async () => {
    const { memberId } = await closedMember("260021", "1 day");
    expect(
      await asApp(() =>
        pgErrorCode(
          client,
          "UPDATE member SET full_name = NULL, phone_e164 = NULL, personal_data_redacted_at = now() WHERE id = $1",
          [memberId],
        ),
      ),
    ).toBe("42501");
  });
});

describe("session.purge", () => {
  it("deletes expired staff sessions, verifications and day-old rate-limit counters", async () => {
    await client.query(
      `INSERT INTO "user" (id, name, email) VALUES ('staff-purge-26', 'Test Staff', 'staff26@example.test')`,
    );
    await client.query(
      `INSERT INTO session (id, token, user_id, expires_at, updated_at, ip_address)
       VALUES ('s-old', 't-old', 'staff-purge-26', now() - interval '1 minute', now(), '198.51.100.1'),
              ('s-live', 't-live', 'staff-purge-26', now() + interval '1 hour', now(), '198.51.100.2')`,
    );
    await client.query(
      `INSERT INTO verification (id, identifier, value, expires_at)
       VALUES ('v-old', 'x', 'y', now() - interval '1 minute'),
              ('v-live', 'x', 'y', now() + interval '1 hour')`,
    );
    await client.query(
      `INSERT INTO staff_rate_limit (id, key, count, last_request)
       VALUES ('r-old', '198.51.100.1/sign-in', 1,
               (extract(epoch FROM now() - interval '25 hours') * 1000)::bigint),
              ('r-live', '198.51.100.2/sign-in', 1, (extract(epoch FROM now()) * 1000)::bigint)`,
    );

    const result = await asApp(() => purgeExpiredStaffRows(db));
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.verifications).toBeGreaterThanOrEqual(1);
    expect(result.rateLimits).toBeGreaterThanOrEqual(1);

    const left = await client.query<{ id: string }>(
      `SELECT id FROM session WHERE id IN ('s-old', 's-live')
       UNION ALL SELECT id FROM verification WHERE id IN ('v-old', 'v-live')
       UNION ALL SELECT id FROM staff_rate_limit WHERE id IN ('r-old', 'r-live')
       ORDER BY id`,
    );
    expect(left.rows.map((r) => r.id)).toEqual(["r-live", "s-live", "v-live"]);
  });
});
