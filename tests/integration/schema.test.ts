import { describe, expect, it } from "vitest";
import { PG, pgErrorCode, connectTestDb } from "./db";

// Database constraints from docs/architecture/database-design.md. These guard the business
// rules even if application code gets them wrong.

const db = connectTestDb();

async function hbcId(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("SELECT id FROM hbc WHERE name = $1", [name]);
  if (!rows[0]) throw new Error(`HBC ${name} not seeded`);
  return rows[0].id;
}

async function insertMember(fwo: string, phone: string | null, status = "ACTIVE") {
  const reason = status === "ACTIVE" ? null : "test";
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO member (fwo_number, full_name, phone_e164, status, status_reason)
     VALUES ($1, 'Test Member', $2, $3, $4) RETURNING id`,
    [fwo, phone, status, reason],
  );
  return rows[0]!.id;
}

async function insertRegistration(reference: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO registration (reference, channel, language) VALUES ($1, 'SELF', 'sw') RETURNING id",
    [reference],
  );
  return rows[0]!.id;
}

describe("reference data", () => {
  it("seeds the 11 HBCs in order", async () => {
    const { rows } = await db.query<{ name: string }>("SELECT name FROM hbc ORDER BY sort_order");
    expect(rows.map((r) => r.name)).toEqual([
      "Jordan",
      "Judea",
      "Galilaya",
      "Samaria",
      "Zion Leisure",
      "Zion Bombolulu",
      "Zion Freretown",
      "Damascus",
      "Jerusalem",
      "Bethlehem B",
      "Bethlehem A",
    ]);
  });

  it("seeds the 8 departments in order", async () => {
    const { rows } = await db.query<{ name: string }>(
      "SELECT name FROM department ORDER BY sort_order",
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Mother's Union",
      "KAMA / AMF",
      "Kiswahili Choir",
      "English Choir",
      "KAYO",
      "Children Ministry",
      "Evangelism",
      "G.F.S.",
    ]);
  });

  it("rejects an HBC name that differs only in case", async () => {
    expect(await pgErrorCode(db, "INSERT INTO hbc (name) VALUES ('JORDAN')")).toBe(
      PG.uniqueViolation,
    );
  });
});

describe("member", () => {
  it("allows an FWO number to belong to only one member, ever (BR-02)", async () => {
    await insertMember("1001", null, "DECEASED");
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member (fwo_number, full_name) VALUES ('1001', 'Someone Else')",
      ),
    ).toBe(PG.uniqueViolation);
  });

  it("rejects an FWO number that is not digits only (BR-01)", async () => {
    expect(
      await pgErrorCode(db, "INSERT INTO member (fwo_number, full_name) VALUES ('12A', 'A Name')"),
    ).toBe(PG.checkViolation);
  });

  it("refuses a stored FWO number with a leading zero: 0042 is stored as 42 (D61)", async () => {
    for (const statement of [
      "INSERT INTO member (fwo_number, full_name) VALUES ('0042', 'A Name')",
      "INSERT INTO member (fwo_number, full_name) VALUES ('00', 'A Name')",
      "INSERT INTO fwo_setting (highest_issued, updated_by_user_id) VALUES ('0500', 'test')",
    ]) {
      expect(await pgErrorCode(db, statement), statement).toBe(PG.checkViolation);
    }
    await insertMember("0", null);
    await insertMember("42", null);
  });

  it("gives a phone number to one active or inactive member only (D20)", async () => {
    await insertMember("2001", "+254712345678");
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member (fwo_number, full_name, phone_e164, status, status_reason) VALUES ('2002', 'B Name', '+254712345678', 'INACTIVE', 'moved')",
      ),
    ).toBe(PG.uniqueViolation);
  });

  it("releases the phone number of a deceased member", async () => {
    await insertMember("3001", "+254798765432", "DECEASED");
    await expect(insertMember("3002", "+254798765432")).resolves.toBeTypeOf("string");
  });

  it("accepts only Kenyan mobile numbers in E.164", async () => {
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member (fwo_number, full_name, phone_e164) VALUES ('4001', 'C Name', '0712345678')",
      ),
    ).toBe(PG.checkViolation);
  });

  it("requires a reason for any status other than ACTIVE", async () => {
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member (fwo_number, full_name, status) VALUES ('5001', 'D Name', 'INACTIVE')",
      ),
    ).toBe(PG.checkViolation);
  });

  it("never lets a member's HBC periods overlap (BR-04)", async () => {
    const memberId = await insertMember("6001", null);
    await db.query(
      "INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from, valid_to) VALUES ($1, $2, '2026-01-01', '2026-06-01')",
      [memberId, await hbcId("Judea")],
    );
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from, valid_to) VALUES ($1, $2, '2026-05-01', '2026-09-01')",
        [memberId, await hbcId("Jordan")],
      ),
    ).toBe(PG.exclusionViolation);
  });

  it("allows consecutive HBC periods after a move", async () => {
    const memberId = await insertMember("6002", null);
    await db.query(
      "INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from, valid_to) VALUES ($1, $2, '2026-01-01', '2026-06-01')",
      [memberId, await hbcId("Judea")],
    );
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from) VALUES ($1, $2, '2026-06-01')",
        [memberId, await hbcId("Jordan")],
      ),
    ).toBeUndefined();
  });
});

describe("registration", () => {
  it("accepts only references like REG-7K3M9", async () => {
    const insert = (ref: string) =>
      pgErrorCode(
        db,
        "INSERT INTO registration (reference, channel, language) VALUES ($1, 'SELF', 'sw')",
        [ref],
      );
    expect(await insert("REG-7K3M9")).toBeUndefined();
    expect(await insert("REG-7K3M0")).toBe(PG.checkViolation); // 0 is excluded
    expect(await insert("REG-7K3MI")).toBe(PG.checkViolation); // I is excluded
  });

  it("records the capturing officer on assisted registrations, and only on those", async () => {
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO registration (reference, channel, language) VALUES ('REG-AAAAA', 'ASSISTED', 'sw')",
      ),
    ).toBe(PG.checkViolation);
  });

  it("cannot be approved without a member record (BR-08)", async () => {
    const id = await insertRegistration("REG-BBBBB");
    expect(
      await pgErrorCode(db, "UPDATE registration SET status = 'APPROVED' WHERE id = $1", [id]),
    ).toBe(PG.checkViolation);
  });

  it("is always created as SUBMITTED", async () => {
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO registration (reference, channel, language, status) VALUES ('REG-FFFFF', 'SELF', 'sw', 'REJECTED')",
      ),
    ).toBe(PG.checkViolation);
  });

  it("takes its decision time from the database clock, never the caller", async () => {
    const id = await insertRegistration("REG-GGGGG");
    const { rows } = await db.query<{ recent: boolean }>(
      `UPDATE registration SET status = 'REJECTED', decided_at = '2000-01-01'
        WHERE id = $1 RETURNING decided_at > now() - interval '1 minute' AS recent`,
      [id],
    );
    expect(rows[0]!.recent).toBe(true);
  });

  it("accepts no further changes once final (invariant 7)", async () => {
    const id = await insertRegistration("REG-HHHHH");
    await db.query("UPDATE registration SET status = 'REJECTED' WHERE id = $1", [id]);
    expect(
      await pgErrorCode(db, "UPDATE registration SET status = 'SUBMITTED' WHERE id = $1", [id]),
    ).toBe(PG.checkViolation);
    expect(
      await pgErrorCode(
        db,
        "UPDATE registration SET decided_at = now() - interval '2 years' WHERE id = $1",
        [id],
      ),
    ).toBe(PG.checkViolation);
  });

  it("requires consent to storage outside Kenya on every revision (BR-15)", async () => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO registration (reference, channel, language) VALUES ('REG-CCCCC', 'SELF', 'sw') RETURNING id",
    );
    expect(
      await pgErrorCode(
        db,
        `INSERT INTO registration_revision
           (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
            adult_declared, transfer_consent, privacy_notice_version)
         VALUES ($1, 1, 'E Name', '7001', '+254700000001', $2, true, false, 'v1')`,
        [rows[0]!.id, await hbcId("Samaria")],
      ),
    ).toBe(PG.checkViolation);
  });
});

describe("role assignment", () => {
  it("allows one active grant per user, role and scope, including GLOBAL", async () => {
    await db.query(
      `INSERT INTO "user" (id, name, email) VALUES ('u1', 'Staff One', 'staff1@example.test')`,
    );
    const grant = () =>
      pgErrorCode(
        db,
        "INSERT INTO role_assignment (user_id, role, granted_by_user_id) VALUES ('u1', 'MEMBERSHIP_ADMIN', 'u1')",
      );
    expect(await grant()).toBeUndefined();
    expect(await grant()).toBe(PG.uniqueViolation);

    await db.query("UPDATE role_assignment SET revoked_at = now() WHERE user_id = 'u1'");
    expect(await grant()).toBeUndefined();
  });
});

describe("app_runtime privileges", () => {
  it("can append to the audit log but never change or remove entries (FR-11)", async () => {
    await db.query("SET LOCAL ROLE app_runtime");
    await db.query(
      "INSERT INTO audit_entry (actor_type, action, entity_type, entity_id) VALUES ('SYSTEM', 'test.run', 'test', '1')",
    );
    expect(await pgErrorCode(db, "UPDATE audit_entry SET action = 'changed'")).toBe(
      PG.insufficientPrivilege,
    );
    expect(await pgErrorCode(db, "DELETE FROM audit_entry")).toBe(PG.insufficientPrivilege);
  });

  it("cannot make a registration look due for redaction (BR-14)", async () => {
    const id = await insertRegistration("REG-JJJJJ");
    await db.query("SET LOCAL ROLE app_runtime");
    await db.query(
      "UPDATE registration SET status = 'REJECTED', decided_at = '2000-01-01' WHERE id = $1",
      [id],
    );
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO registration_decision (registration_id, action, reason, actor_user_id, at) VALUES ($1, 'REJECT', 'x', 'u', '2000-01-01')",
        [id],
      ),
    ).toBe(PG.insufficientPrivilege);
    expect(await pgErrorCode(db, "SELECT redact_expired_registration($1)", [id])).toBe(
      PG.raiseException,
    );
  });

  it("cannot fool retention redaction with a temporary table", async () => {
    const id = await insertRegistration("REG-KKKKK");
    await db.query("SET LOCAL ROLE app_runtime");
    await db.query(
      `CREATE TEMP TABLE registration ON COMMIT DROP AS
         SELECT $1::uuid AS id, 'REJECTED'::text AS status,
                now() - interval '5 years' AS decided_at, NULL::timestamptz AS personal_data_redacted_at`,
      [id],
    );
    expect(await pgErrorCode(db, "SELECT redact_expired_registration($1)", [id])).toBe(
      PG.raiseException,
    );
  });

  it("cannot change a registration's identity or redaction marker", async () => {
    const id = await insertRegistration("REG-LLLLL");
    await db.query("SET LOCAL ROLE app_runtime");
    for (const column of [
      "reference = 'REG-MMMMM'",
      "channel = 'ASSISTED'",
      "personal_data_redacted_at = now()",
    ]) {
      expect(await pgErrorCode(db, `UPDATE registration SET ${column} WHERE id = $1`, [id])).toBe(
        PG.insufficientPrivilege,
      );
    }
  });

  it("cannot backdate an audit entry or mark it redacted", async () => {
    await db.query("SET LOCAL ROLE app_runtime");
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO audit_entry (actor_type, action, entity_type, entity_id, at) VALUES ('SYSTEM', 'x', 'test', '1', '2020-01-01')",
      ),
    ).toBe(PG.insufficientPrivilege);
    expect(
      await pgErrorCode(
        db,
        "INSERT INTO audit_entry (actor_type, action, entity_type, entity_id, redacted_at) VALUES ('SYSTEM', 'x', 'test', '1', now())",
      ),
    ).toBe(PG.insufficientPrivilege);
  });

  it("cannot edit registration revisions in place (BR-09)", async () => {
    await db.query("SET LOCAL ROLE app_runtime");
    expect(await pgErrorCode(db, "UPDATE registration_revision SET full_name = 'x'")).toBe(
      PG.insufficientPrivilege,
    );
  });

  it("cannot use retention redaction on a registration that is not due (BR-14)", async () => {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO registration (reference, channel, language) VALUES ('REG-DDDDD', 'SELF', 'sw') RETURNING id",
    );
    await db.query("SET LOCAL ROLE app_runtime");
    expect(await pgErrorCode(db, "SELECT redact_expired_registration($1)", [rows[0]!.id])).toBe(
      PG.raiseException,
    );
  });

  it("redacts personal details 12 months after rejection, keeping the decision (BR-14)", async () => {
    // Simulate a rejection 13 months ago. The guard trigger rightly forbids backdating, so
    // switch it off for this setup only (the test transaction is rolled back).
    await db.query("ALTER TABLE registration DISABLE TRIGGER registration_guard");
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO registration (reference, channel, language, status, decided_at)
       VALUES ('REG-EEEEE', 'SELF', 'sw', 'REJECTED', now() - interval '13 months') RETURNING id`,
    );
    await db.query("ALTER TABLE registration ENABLE TRIGGER registration_guard");
    const id = rows[0]!.id;
    await db.query(
      `INSERT INTO registration_decision (registration_id, action, reason, actor_user_id, at)
       VALUES ($1, 'REJECT', 'Not a member of this parish', 'staff-1', now() - interval '13 months')`,
      [id],
    );
    await db.query(
      `INSERT INTO registration_revision
         (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
          adult_declared, transfer_consent, privacy_notice_version)
       VALUES ($1, 1, 'F Name', '8001', '+254700000002', $2, true, true, 'v1')`,
      [id, await hbcId("Damascus")],
    );
    await db.query(
      `INSERT INTO audit_entry (actor_type, action, entity_type, entity_id, after)
       VALUES ('PUBLIC', 'registration.submit', 'registration', $1, '{"full_name":"F Name"}')`,
      [id],
    );

    await db.query("SET LOCAL ROLE app_runtime");
    await db.query("SELECT redact_expired_registration($1)", [id]);
    await db.query("RESET ROLE");

    const revision = await db.query(
      "SELECT full_name, fwo_number, phone_e164, hbc_id, redacted_at FROM registration_revision WHERE registration_id = $1",
      [id],
    );
    expect(revision.rows[0]).toMatchObject({
      full_name: null,
      fwo_number: null,
      phone_e164: null,
      hbc_id: null,
    });
    expect(revision.rows[0].redacted_at).not.toBeNull();

    const audit = await db.query(
      "SELECT action, after FROM audit_entry WHERE entity_id = $1 ORDER BY id",
      [id],
    );
    expect(audit.rows).toEqual([
      { action: "registration.submit", after: null },
      { action: "registration.redact", after: null },
    ]);

    const registration = await db.query(
      "SELECT reference, status FROM registration WHERE id = $1",
      [id],
    );
    expect(registration.rows[0]).toEqual({ reference: "REG-EEEEE", status: "REJECTED" });
  });
});

describe("readonly_ops privileges", () => {
  it("can read the registry but never staff credentials", async () => {
    await db.query("SET LOCAL ROLE readonly_ops");
    expect(await pgErrorCode(db, "SELECT count(*) FROM member")).toBeUndefined();
    for (const table of ["account", "session", "verification", "two_factor"]) {
      expect(await pgErrorCode(db, `SELECT count(*) FROM ${table}`)).toBe(PG.insufficientPrivilege);
    }
  });
});

describe("privilege coverage", () => {
  // Every table needs a deliberate privilege decision. A new table that is not listed here
  // fails this test until its grants are added to a migration and recorded below.
  const RUNTIME_UPDATE = new Set([
    "hbc",
    "department",
    "member_hbc_assignment",
    "department_membership",
    "phone_challenge",
    "sms_outbox",
    "sms_setting",
    "fwo_setting",
    "sms_daily_usage",
    "rate_limit_bucket",
    "role_assignment",
    "user",
    "session",
    "account",
    "verification",
    "two_factor",
    "staff_rate_limit",
  ]);
  const RUNTIME_DELETE = new Set([
    "phone_challenge",
    "rate_limit_bucket",
    "sms_outbox",
    "session",
    "verification",
    "account",
    "two_factor",
    "staff_rate_limit",
  ]);
  const CREDENTIALS = new Set(["account", "session", "verification", "two_factor"]);

  it("lets app_runtime change only the member columns its work changes (D45, #26)", async () => {
    const { rows } = await db.query<{ column: string }>(`
      SELECT a.attname AS column
        FROM pg_attribute a
       WHERE a.attrelid = 'public.member'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND has_column_privilege('app_runtime', a.attrelid, a.attnum, 'UPDATE')
       ORDER BY 1`);
    // Not personal_data_redacted_at: only redact_closed_member() (owner) sets it.
    expect(rows.map((r) => r.column)).toEqual([
      "full_name",
      "language",
      "phone_e164",
      "status",
      "status_reason",
      "updated_at",
      "version",
    ]);
  });

  it("matches the documented grants for every table", async () => {
    const { rows } = await db.query<{
      table: string;
      select: boolean;
      update: boolean;
      delete: boolean;
      ops_select: boolean;
    }>(`
      SELECT c.relname AS table,
             has_table_privilege('app_runtime', c.oid, 'SELECT') AS select,
             has_table_privilege('app_runtime', c.oid, 'UPDATE') AS update,
             has_table_privilege('app_runtime', c.oid, 'DELETE') AS delete,
             has_table_privilege('readonly_ops', c.oid, 'SELECT') AS ops_select
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY 1`);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect({ table: row.table, select: row.select }).toEqual({ table: row.table, select: true });
      expect({ table: row.table, update: row.update }).toEqual({
        table: row.table,
        update: RUNTIME_UPDATE.has(row.table),
      });
      expect({ table: row.table, delete: row.delete }).toEqual({
        table: row.table,
        delete: RUNTIME_DELETE.has(row.table),
      });
      expect({ table: row.table, ops: row.ops_select }).toEqual({
        table: row.table,
        ops: !CREDENTIALS.has(row.table),
      });
    }
  });
});
