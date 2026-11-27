import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Transaction } from "../../src/db";
import {
  approveRegistration,
  checkAssistedRegistration,
  issueFwoNumber,
  PRIVACY_NOTICE_VERSION,
  rejectRegistration,
  setHighestFwoIssued,
  submitAssistedRegistration,
  suggestFwoNumber,
  type AssistedRegistrationFields,
} from "../../src/modules/registration";
import { connectTestDrizzle, PG, rolledBack } from "./db";
import { testDatabaseUrl } from "./env";

// New members' FWO numbers (issue #101, BR-16, D30) against real Postgres, as app_runtime.
// Registrations are made at the desk with IN_PERSON evidence. All data is synthetic.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-101" } as const;
const SECRETARY = { type: "STAFF", userId: "test-secretary-101" } as const;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

let counter = 0;

/** A SUBMITTED assisted registration: a new member with no FWO number, unless overridden. */
async function registered(tx: Transaction, over: Partial<AssistedRegistrationFields> = {}) {
  counter++;
  const { rows } = await tx.execute<{ id: string }>(sql`SELECT id FROM hbc WHERE name = 'Judea'`);
  const { rows: dep } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM department WHERE name = 'English Choir'`,
  );
  const checked = checkAssistedRegistration({
    fullName: "Test New Member",
    isNewMember: true,
    fwoNumber: "",
    noPersonalPhone: false,
    phone: `0700 101 ${String(counter).padStart(3, "0")}`,
    hbcId: rows[0]!.id,
    departmentIds: [dep[0]!.id],
    verification: "IN_PERSON",
    eventLabel: "Judea HBC AGM, 17 Jan 2027",
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
    readBackConfirmed: true,
    ...over,
  });
  if (!checked.ok) throw new Error(`test fields invalid: ${JSON.stringify(checked.errors)}`);
  const result = await submitAssistedRegistration(
    tx,
    { submissionId: randomUUID(), registration: checked.value, officer: OFFICER, language: "en" },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test registration refused");
  return result.registrationId;
}

async function versionOf(tx: Pick<Transaction, "execute">, id: string) {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${id}`,
  );
  return rows[0]!.version;
}

async function issue(tx: Transaction, id: string, fwoNumber: string, version?: number) {
  return issueFwoNumber(tx, {
    registrationId: id,
    version: version ?? (await versionOf(tx, id)),
    fwoNumber,
    actor: SECRETARY,
    requestId: "req-101",
  });
}

async function setting(tx: Transaction) {
  const { rows } = await tx.execute<{ highest_issued: string }>(
    sql`SELECT highest_issued FROM fwo_setting`,
  );
  return rows[0]?.highest_issued ?? null;
}

describe("the D30 setting and its suggestion", () => {
  it("suggests nothing, and issues nothing, until the setting is recorded", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      expect(await suggestFwoNumber(tx)).toBeNull();
      expect(await issue(tx, id, "500")).toEqual({ ok: false, reason: "no_setting" });
    });
  });

  it("suggests one more than the setting, every member's FWO and every open registration's, as numbers", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(await setHighestFwoIssued(tx, { value: "0500", actor: SECRETARY })).toEqual({
        ok: true,
      });
      expect(await suggestFwoNumber(tx)).toBe("501");
      // A member's "0900" counts as 900 (D29).
      await asOwner(tx, () =>
        tx.execute(sql`INSERT INTO member (fwo_number, full_name) VALUES ('0900', 'Test Member')`),
      );
      expect(await suggestFwoNumber(tx)).toBe("901");
      // A number typed on an open registration doesn't count: anyone can type one (BR-03 still
      // refuses issuing it).
      await registered(tx, { isNewMember: false, fwoNumber: "99999999" });
      expect(await suggestFwoNumber(tx)).toBe("901");
    });
  });

  it("records and changes the setting, audited with the old and new values; digits only", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(await setHighestFwoIssued(tx, { value: "12a", actor: SECRETARY })).toEqual({
        ok: false,
        reason: "invalid",
      });
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      await setHighestFwoIssued(tx, { value: "0700", actor: SECRETARY });
      expect(await setting(tx)).toBe("0700");
      const audit = await tx.execute<{ before: unknown; after: unknown }>(sql`
        SELECT before, after FROM audit_entry WHERE action = 'fwo_setting.update' ORDER BY id`);
      expect(audit.rows).toEqual([
        { before: null, after: { highestIssued: "500" } },
        { before: { highestIssued: "500" }, after: { highestIssued: "0700" } },
      ]);
    });
  });
});

describe("issueFwoNumber (BR-16, D30)", () => {
  it("adds a revision with the number, moves the registration on, records evidence and raises the setting", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const id = await registered(tx);
      const before = await versionOf(tx, id);

      expect(await issue(tx, id, "501")).toEqual({ ok: true });

      const reg = await tx.execute<{ current_revision_no: number; version: number }>(
        sql`SELECT current_revision_no, version FROM registration WHERE id = ${id}`,
      );
      expect(reg.rows[0]).toEqual({ current_revision_no: 2, version: before + 1 });
      const revisions = await tx.execute<Record<string, unknown>>(sql`
        SELECT revision_no, full_name, fwo_number, phone_e164, is_new_member, transfer_consent,
               privacy_notice_version, submitted_by_user_id,
               (SELECT count(*)::int FROM registration_revision_department d
                 WHERE d.registration_id = r.registration_id AND d.revision_no = r.revision_no) AS departments
          FROM registration_revision r WHERE registration_id = ${id} ORDER BY revision_no`);
      const [first, second] = revisions.rows;
      expect(second).toEqual({
        ...first,
        revision_no: 2,
        fwo_number: "501",
        submitted_by_user_id: SECRETARY.userId,
      });
      expect(first).toMatchObject({ revision_no: 1, fwo_number: null, departments: 1 });

      const evidence = await tx.execute<{ kind: string; actor_user_id: string }>(sql`
        SELECT kind, actor_user_id FROM verification_evidence
         WHERE registration_id = ${id} AND kind = 'FWO_CONFIRMED_BY_SECRETARY'`);
      expect(evidence.rows).toEqual([
        { kind: "FWO_CONFIRMED_BY_SECRETARY", actor_user_id: SECRETARY.userId },
      ]);
      expect(await setting(tx)).toBe("501");

      const audit = await tx.execute<{ action: string; after: unknown }>(sql`
        SELECT action, after FROM audit_entry WHERE request_id = 'req-101' ORDER BY id`);
      expect(audit.rows).toEqual([
        {
          action: "registration.issue_fwo",
          after: { revisionNo: 2, suggestionTaken: true, settingRaised: true },
        },
      ]);
      // The number is in the revision only, which retention redacts (BR-14): no audit entry
      // anywhere holds it.
      const mentions = await tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM audit_entry
         WHERE before::text LIKE '%501%' OR after::text LIKE '%501%'`);
      expect(mentions.rows[0]!.n).toBe(0);
    });
  });

  it("keeps the setting when the number issued is lower, and notes the suggestion wasn't taken", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const id = await registered(tx);
      expect(await issue(tx, id, "0042")).toEqual({ ok: true });
      expect(await setting(tx)).toBe("500");
      const audit = await tx.execute<{ action: string; after: unknown }>(sql`
        SELECT action, after FROM audit_entry WHERE request_id = 'req-101' ORDER BY id`);
      expect(audit.rows).toEqual([
        {
          action: "registration.issue_fwo",
          after: { revisionNo: 2, suggestionTaken: false, settingRaised: false },
        },
      ]);
    });
  });

  it("refuses a number that isn't digits, or is a member's or another open registration's", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      await asOwner(tx, () =>
        tx.execute(sql`INSERT INTO member (fwo_number, full_name) VALUES ('300', 'Test Member')`),
      );
      await registered(tx, { isNewMember: false, fwoNumber: "301" });
      const id = await registered(tx);
      expect(await issue(tx, id, "3o2")).toEqual({ ok: false, reason: "fwo_invalid" });
      expect(await issue(tx, id, "300")).toEqual({ ok: false, reason: "fwo_held" });
      expect(await issue(tx, id, "301")).toEqual({
        ok: false,
        reason: "fwo_in_open_registration",
      });
      const reg = await tx.execute<{ current_revision_no: number }>(
        sql`SELECT current_revision_no FROM registration WHERE id = ${id}`,
      );
      expect(reg.rows[0]!.current_revision_no).toBe(1);
    });
  });

  it("refuses a stale version, an existing member's registration and a second number", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const id = await registered(tx);
      const seen = await versionOf(tx, id);
      expect(await issue(tx, id, "501", seen + 5)).toEqual({ ok: false, reason: "stale" });
      expect(await issue(tx, id, "501", seen)).toEqual({ ok: true });
      // Already has one now.
      expect(await issue(tx, id, "502")).toEqual({ ok: false, reason: "not_waiting_for_fwo" });
      const existing = await registered(tx, { isNewMember: false, fwoNumber: "777" });
      expect(await issue(tx, existing, "503")).toEqual({
        ok: false,
        reason: "not_waiting_for_fwo",
      });
      expect(await issue(tx, randomUUID(), "504", 0)).toEqual({ ok: false, reason: "not_found" });
    });
  });

  it("never issues a number twice, even after the registration it went to is rejected (D2)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const first = await registered(tx);
      await issue(tx, first, "450");
      await rejectRegistration(tx, {
        registrationId: first,
        version: await versionOf(tx, first),
        reason: "Moved away",
        actor: SECRETARY,
      });
      const second = await registered(tx);
      expect(await issue(tx, second, "450")).toEqual({ ok: false, reason: "fwo_issued_before" });
      // Nor can the setting go below a number already issued.
      await issue(tx, second, "600");
      expect(await setHighestFwoIssued(tx, { value: "599", actor: SECRETARY })).toEqual({
        ok: false,
        reason: "below_issued",
        highestIssued: "600",
      });
    });
  });

  it("asks for consent to the current notice when it changed since the member registered (D35)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const id = await registered(tx);
      await asOwner(tx, () =>
        tx.execute(sql`
          UPDATE registration_revision SET privacy_notice_version = '2026-01-01'
           WHERE registration_id = ${id}`),
      );
      expect(await issue(tx, id, "501")).toEqual({ ok: false, reason: "notice_changed" });
      const result = await issueFwoNumber(tx, {
        registrationId: id,
        version: await versionOf(tx, id),
        fwoNumber: "501",
        consentToCurrentNotice: true,
        actor: SECRETARY,
        requestId: "req-101",
      });
      expect(result).toEqual({ ok: true });
      const revision = await tx.execute<{ privacy_notice_version: string }>(sql`
        SELECT privacy_notice_version FROM registration_revision
         WHERE registration_id = ${id} AND revision_no = 2`);
      expect(revision.rows[0]!.privacy_notice_version).toBe(PRIVACY_NOTICE_VERSION);
      const audit = await tx.execute<{ after: Record<string, unknown> }>(sql`
        SELECT after FROM audit_entry WHERE action = 'registration.issue_fwo' AND request_id = 'req-101'`);
      expect(audit.rows[0]!.after).toMatchObject({ consentToNotice: PRIVACY_NOTICE_VERSION });
    });
  });

  it("lets the registration be approved once the number is entered (#19)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const id = await registered(tx);
      const approve = async () =>
        approveRegistration(tx, {
          registrationId: id,
          version: await versionOf(tx, id),
          actor: SECRETARY,
        });
      expect(await approve()).toEqual({ ok: false, reason: "no_fwo" });
      await issue(tx, id, "501");
      expect(await approve()).toMatchObject({ ok: true });
      const member = await tx.execute<{ fwo_number: string }>(
        sql`SELECT fwo_number FROM member WHERE source_registration_id = ${id}`,
      );
      expect(member.rows[0]!.fwo_number).toBe("501");
    });
  });
});

describe("fwo_setting privileges and constraints", () => {
  it("holds one row, and app_runtime can't delete it", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
      const code = (statement: ReturnType<typeof sql>) =>
        tx
          .transaction((savepoint) => savepoint.execute(statement))
          .then(
            () => undefined,
            (error: unknown) => (error as { cause?: { code?: string } }).cause?.code,
          );
      expect(await code(sql`DELETE FROM fwo_setting`)).toBe(PG.insufficientPrivilege);
      expect(
        await code(
          sql`INSERT INTO fwo_setting (highest_issued, updated_by_user_id) VALUES ('1', 'x')`,
        ),
      ).toBe(PG.uniqueViolation);
    });
  });
});

describe("under concurrency (separate connections)", () => {
  it("issues a number once when two Secretaries take it at the same moment", async () => {
    const pool = createDb(testDatabaseUrl());
    const ids: string[] = [];
    try {
      await pool.db.transaction(async (tx) => {
        await setHighestFwoIssued(tx, { value: "500", actor: SECRETARY });
        ids.push(await registered(tx), await registered(tx));
      });
      const results = await Promise.all(
        ids.map(async (id) =>
          issueFwoNumber(pool.db, {
            registrationId: id,
            version: await versionOf(pool.db, id),
            fwoNumber: "501",
            actor: SECRETARY,
          }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(results.filter((r) => !r.ok)).toEqual([
        { ok: false, reason: "fwo_in_open_registration" },
      ]);
    } finally {
      // Committed rows: removed as the owner, so the next tests start clean.
      const idList = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      );
      for (const statement of [
        sql`DELETE FROM verification_evidence WHERE registration_id::text IN (${idList})`,
        sql`DELETE FROM registration_revision_department WHERE registration_id::text IN (${idList})`,
        sql`DELETE FROM registration_revision WHERE registration_id::text IN (${idList})`,
        sql`DELETE FROM sms_outbox WHERE phone_e164 LIKE '+254700101%'`,
        sql`DELETE FROM audit_entry WHERE entity_id IN (${idList}) OR entity_type = 'fwo_setting'`,
        sql`DELETE FROM registration WHERE id::text IN (${idList})`,
        sql`DELETE FROM fwo_setting`,
      ]) {
        await pool.db.execute(statement);
      }
      await pool.close();
    }
  });
});
