import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { importMembers, previewImport } from "../../src/modules/membership";
import {
  checkAssistedRegistration,
  importParishList,
  submitAssistedRegistration,
} from "../../src/modules/registration";
import { connectTestDrizzle, PG, rolledBack } from "./db";

// The import of the parish list (issue #104, FR-13, D47) against real Postgres, as app_runtime,
// so the grants on member_import are exercised too. Every row is synthetic.

const db = connectTestDrizzle();
const ADMIN = { type: "STAFF", userId: "test-admin-104" } as const;
const NOTICE = "2026-11-26";
const CONSENT = "2026-11-25";

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

const FILE = [
  "fwo_number,full_name,phone,hbc,departments,language",
  "10401,Test Import One,0712 104 001,Judea,English Choir; KAYO,",
  "010402,Test Import Two,,Samaria,,sw",
  "10403,Test Import Three,0712104003,Narnia,,",
  "10404,Test Import Four,0712104004,Judea,,",
].join("\n");

async function confirm(
  tx: Transaction,
  text = FILE,
  over: { digest?: string; count?: number } = {},
) {
  const preview = await previewImport(tx, text);
  if (!preview.ok) throw new Error("test file invalid");
  return importMembers(tx, {
    text,
    digest: over.digest ?? preview.digest,
    expectedCount: over.count ?? preview.toImport,
    consentConfirmedOn: CONSENT,
    privacyNoticeVersion: NOTICE,
    actor: ADMIN,
    requestId: "req-import",
  });
}

/** A member who already holds FWO 10404 and the phone of row 2, as an approved member would. */
async function existingMember(tx: Transaction) {
  await asOwner(tx, () =>
    tx.execute(sql`
      WITH m AS (
        INSERT INTO member (fwo_number, full_name, phone_e164, language)
        VALUES ('10404', 'Test Existing Member', '+254712104001', 'en') RETURNING id)
      INSERT INTO member_hbc_assignment (member_id, hbc_id)
      SELECT m.id, (SELECT id FROM hbc WHERE name = 'Judea') FROM m`),
  );
}

describe("previewImport (FR-13)", () => {
  it("counts the rows to import and names each skipped row's rules; stores nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await existingMember(tx);
      const before = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM member`);

      const preview = await previewImport(tx, FILE);
      expect(preview).toEqual({
        ok: true,
        digest: expect.stringMatching(/^[0-9a-f]{64}$/),
        toImport: 1,
        skipped: [
          { rowNumber: 2, problems: ["phone_held"] },
          { rowNumber: 4, problems: ["hbc_unknown"] },
          { rowNumber: 5, problems: ["fwo_held"] },
        ],
      });

      const after = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM member`);
      expect(after.rows[0]!.n).toBe(before.rows[0]!.n);
      const batches = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM member_import`,
      );
      expect(batches.rows[0]!.n).toBe(0);
    });
  });

  it("explains a file it can't read", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(await previewImport(tx, "name,phone\nTest,0712")).toEqual({
        ok: false,
        error: { kind: "missing_columns", columns: ["fwo_number", "full_name", "hbc"] },
      });
    });
  });
});

describe("importMembers (FR-13, D47)", () => {
  it("creates each valid row as an ACTIVE member with its HBC, departments and import record", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await confirm(tx);
      expect(result).toEqual({
        ok: true,
        importId: expect.any(String),
        imported: 3,
        skipped: 1,
        fwoNumbers: ["10401", "010402", "10404"],
        phones: ["+254712104001", "+254712104004"],
      });
      if (!result.ok) return;

      const batch = await tx.execute<Record<string, unknown>>(sql`
        SELECT imported_by_user_id, consent_confirmed_on::text AS consent, privacy_notice_version,
               rows_imported, rows_skipped
          FROM member_import WHERE id = ${result.importId}`);
      expect(batch.rows[0]).toEqual({
        imported_by_user_id: ADMIN.userId,
        consent: CONSENT,
        privacy_notice_version: NOTICE,
        rows_imported: 3,
        rows_skipped: 1,
      });

      const members = await tx.execute<Record<string, unknown>>(sql`
        SELECT m.fwo_number, m.full_name, m.phone_e164, m.status, m.language,
               m.source_registration_id, h.name AS hbc,
               (SELECT string_agg(d.name || ':' || dm.state, ',' ORDER BY d.name)
                  FROM department_membership dm JOIN department d ON d.id = dm.department_id
                 WHERE dm.member_id = m.id AND dm.valid_to IS NULL) AS departments
          FROM member m
          JOIN member_hbc_assignment a ON a.member_id = m.id AND a.valid_to IS NULL
          JOIN hbc h ON h.id = a.hbc_id
         WHERE m.import_id = ${result.importId}
         ORDER BY m.fwo_number`);
      expect(members.rows).toEqual([
        {
          fwo_number: "010402", // leading zero kept (D29)
          full_name: "Test Import Two",
          phone_e164: null, // no personal phone (BR-06)
          status: "ACTIVE",
          language: "sw",
          source_registration_id: null,
          hbc: "Samaria",
          departments: null,
        },
        {
          fwo_number: "10401",
          full_name: "Test Import One",
          phone_e164: "+254712104001",
          status: "ACTIVE",
          language: "en", // English unless the file says otherwise (D44)
          source_registration_id: null,
          hbc: "Judea",
          departments: "English Choir:DECLARED,KAYO:DECLARED",
        },
        {
          fwo_number: "10404",
          full_name: "Test Import Four",
          phone_e164: "+254712104004",
          status: "ACTIVE",
          language: "en",
          source_registration_id: null,
          hbc: "Judea",
          departments: null,
        },
      ]);
    });
  });

  it("audits every member and the batch, with counts and ids only (rule 4, rule 2)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await confirm(tx);
      if (!result.ok) throw new Error("import refused");

      const entries = await tx.execute<{ action: string; actor_id: string; after: unknown }>(sql`
        SELECT action, actor_id, after FROM audit_entry
         WHERE request_id = 'req-import' ORDER BY action, entity_id`);
      expect(entries.rows.map((e) => e.action)).toEqual([
        "member.create",
        "member.create",
        "member.create",
        "member_import.create",
      ]);
      expect(entries.rows.every((e) => e.actor_id === ADMIN.userId)).toBe(true);
      expect(entries.rows[3]!.after).toEqual({
        imported: 3,
        skipped: 1,
        consentConfirmedOn: CONSENT,
        privacyNoticeVersion: NOTICE,
      });
      expect(entries.rows[0]!.after).toMatchObject({ status: "ACTIVE", importId: result.importId });
      // No name, phone or FWO number from the file in any entry.
      const text = JSON.stringify(entries.rows.map((e) => e.after));
      for (const value of ["Test Import", "712104", "10401", "010402"]) {
        expect(text).not.toContain(value);
      }
      // No SMS on import.
      const sms = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sms_outbox`);
      expect(sms.rows[0]!.n).toBe(0);
    });
  });

  it("refuses a file that isn't the one previewed, storing nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const preview = await previewImport(tx, FILE);
      if (!preview.ok) throw new Error("test file invalid");
      const result = await importMembers(tx, {
        text: `${FILE}\n10405,Test Import Five,,Judea,,`,
        digest: preview.digest,
        expectedCount: preview.toImport,
        consentConfirmedOn: CONSENT,
        privacyNoticeVersion: NOTICE,
        actor: ADMIN,
      });
      expect(result).toEqual({ ok: false, reason: "file_changed" });
      const n = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM member_import`);
      expect(n.rows[0]!.n).toBe(0);
    });
  });

  it("refuses when the registry changed since the preview, with a fresh preview", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      // The preview counted 3 rows; then FWO 10404 became a member's.
      const preview = await previewImport(tx, FILE);
      if (!preview.ok) throw new Error("test file invalid");
      await existingMember(tx);
      const result = await importMembers(tx, {
        text: FILE,
        digest: preview.digest,
        expectedCount: preview.toImport,
        consentConfirmedOn: CONSENT,
        privacyNoticeVersion: NOTICE,
        actor: ADMIN,
      });
      expect(result).toMatchObject({
        ok: false,
        reason: "registry_changed",
        preview: { ok: true, toImport: 1 },
      });
      const n = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM member_import`);
      expect(n.rows[0]!.n).toBe(0);
    });
  });

  it("imports the text previewed even when its line ends come back as CRLF", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const preview = await previewImport(tx, FILE);
      if (!preview.ok) throw new Error("test file invalid");
      const result = await importMembers(tx, {
        text: FILE.replace(/\n/g, "\r\n"),
        digest: preview.digest,
        expectedCount: preview.toImport,
        consentConfirmedOn: CONSENT,
        privacyNoticeVersion: NOTICE,
        actor: ADMIN,
      });
      expect(result).toMatchObject({ ok: true, imported: 3 });
    });
  });

  it("refuses a file with nothing to import", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const text = "fwo_number,full_name,phone,hbc\n1,Test Person,,Narnia";
      expect(await confirm(tx, text, { count: 0 })).toMatchObject({
        ok: false,
        reason: "nothing_to_import",
        preview: { ok: true, toImport: 0, skipped: [{ rowNumber: 2, problems: ["hbc_unknown"] }] },
      });
    });
  });
});

describe("importParishList (FR-13, BR-03, BR-06)", () => {
  it("flags open registrations whose FWO number or phone the import made a member's", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { rows: hbcRows } = await tx.execute<{ id: string }>(
        sql`SELECT id FROM hbc WHERE name = 'Judea'`,
      );
      const submit = async (fwoNumber: string, phone: string) => {
        const checked = checkAssistedRegistration({
          fullName: "Test Registrant",
          isNewMember: false,
          fwoNumber,
          noPersonalPhone: false,
          phone,
          hbcId: hbcRows[0]!.id,
          departmentIds: [],
          verification: "IN_PERSON",
          eventLabel: "Judea HBC AGM, 17 Jan 2027",
          adultDeclared: true,
          privacyAcknowledged: true,
          transferConsent: true,
          readBackConfirmed: true,
        });
        if (!checked.ok) throw new Error("test fields invalid");
        const result = await submitAssistedRegistration(
          tx,
          {
            submissionId: randomUUID(),
            registration: checked.value,
            officer: { type: "STAFF", userId: "test-officer-104" },
            language: "en",
          },
          "test-otp-secret-0123456789abcdef",
        );
        if (!result.ok) throw new Error("test registration refused");
        return result.registrationId;
      };
      // Submitted before the import, so neither was flagged then.
      const sameFwo = await submit("10401", "0712104901");
      const samePhone = await submit("10499", "0712104004");
      const unrelated = await submit("10498", "0712104902");

      const preview = await previewImport(tx, FILE);
      if (!preview.ok) throw new Error("test file invalid");
      const result = await importParishList(tx, {
        text: FILE,
        digest: preview.digest,
        expectedCount: preview.toImport,
        consentConfirmedOn: CONSENT,
        actor: ADMIN,
        requestId: "req-flag",
      });
      expect(result).toMatchObject({ ok: true, imported: 3 });

      const flags = await tx.execute<{
        id: string;
        fwo_conflict: boolean;
        phone_conflict: boolean;
        version: number;
      }>(sql`
        SELECT id, fwo_conflict, phone_conflict, version FROM registration
         WHERE id IN (${sameFwo}, ${samePhone}, ${unrelated})`);
      const byId = new Map(flags.rows.map((r) => [r.id, r]));
      expect(byId.get(sameFwo)).toMatchObject({
        fwo_conflict: true,
        phone_conflict: false,
        version: 1,
      });
      expect(byId.get(samePhone)).toMatchObject({
        fwo_conflict: false,
        phone_conflict: true,
        version: 1,
      });
      expect(byId.get(unrelated)).toMatchObject({
        fwo_conflict: false,
        phone_conflict: false,
        version: 0,
      });

      const audit = await tx.execute<{ entity_id: string; after: unknown }>(sql`
        SELECT entity_id, after FROM audit_entry
         WHERE action = 'registration.flag_conflict' AND request_id = 'req-flag'
         ORDER BY entity_id`);
      expect(new Map(audit.rows.map((r) => [r.entity_id, r.after]))).toEqual(
        new Map<string, unknown>([
          [sameFwo, { fwoConflict: true, cause: "member_import" }],
          [samePhone, { phoneConflict: true, cause: "member_import" }],
        ]),
      );
    });
  });
});

describe("member_import privileges and constraints", () => {
  it("lets app_runtime insert and read import records, never change or delete them", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await confirm(tx);
      if (!result.ok) throw new Error("import refused");
      for (const statement of [
        sql`UPDATE member_import SET rows_imported = 1`,
        sql`DELETE FROM member_import`,
      ]) {
        const code = await tx
          .transaction((savepoint) => savepoint.execute(statement))
          .then(
            () => undefined,
            (error: unknown) => (error as { cause?: { code?: string } }).cause?.code,
          );
        expect(code).toBe(PG.insufficientPrivilege);
      }
    });
  });

  it("refuses a member that is both approved from a registration and imported", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await confirm(tx);
      if (!result.ok) throw new Error("import refused");
      const code = await tx
        .transaction((savepoint) =>
          savepoint.execute(sql`
            UPDATE member SET source_registration_id = gen_random_uuid()
             WHERE import_id = ${result.importId}`),
        )
        .then(
          () => undefined,
          (error: unknown) => (error as { cause?: { code?: string } }).cause?.code,
        );
      // The check fires before the foreign key: an imported member can't gain a registration.
      expect([PG.checkViolation, "23503"]).toContain(code);
    });
  });
});
