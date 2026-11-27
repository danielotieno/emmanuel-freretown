import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import {
  approveRegistration,
  checkAssistedRegistration,
  issueFwoNumber,
  listReviewQueue,
  setHighestFwoIssued,
  submitAssistedRegistration,
  type AssistedRegistrationFields,
} from "../../src/modules/registration";
import { connectTestDrizzle, rolledBack } from "./db";

// A new member who doesn't know their HBC (issue #105, D49, BR-04, BR-16) against real Postgres,
// as app_runtime: stored with no HBC, refused at approval until the Church Secretary sets it with
// the FWO number. All data is synthetic.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-105" } as const;
const SECRETARY = { type: "STAFF", userId: "test-secretary-105" } as const;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

async function hbcId(tx: Transaction, name: string) {
  const { rows } = await tx.execute<{ id: string }>(sql`SELECT id FROM hbc WHERE name = ${name}`);
  return rows[0]!.id;
}

let counter = 0;

/** A SUBMITTED assisted registration of a new member who doesn't know their HBC. */
async function registered(tx: Transaction, over: Partial<AssistedRegistrationFields> = {}) {
  counter++;
  const checked = checkAssistedRegistration({
    fullName: "Test Newcomer",
    isNewMember: true,
    fwoNumber: "",
    noPersonalPhone: false,
    phone: `0700 105 ${String(counter).padStart(3, "0")}`,
    hbcId: "",
    hbcUnknown: true,
    departmentIds: [],
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
  if (!result.ok) throw new Error(`test registration refused: ${JSON.stringify(result)}`);
  return result.registrationId;
}

async function versionOf(tx: Transaction, id: string) {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${id}`,
  );
  return rows[0]!.version;
}

const issue = async (tx: Transaction, id: string, fwoNumber: string, hbc?: string) =>
  issueFwoNumber(tx, {
    registrationId: id,
    version: await versionOf(tx, id),
    fwoNumber,
    hbcId: hbc,
    actor: SECRETARY,
    requestId: "req-105",
  });

describe("a new member without an HBC (D49)", () => {
  it("is stored with no HBC and listed in the queue as such", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const revision = await tx.execute<{ hbc_id: string | null; is_new_member: boolean }>(sql`
        SELECT hbc_id, is_new_member FROM registration_revision WHERE registration_id = ${id}`);
      expect(revision.rows[0]).toEqual({ hbc_id: null, is_new_member: true });
      const { items } = await listReviewQueue(tx, { flag: "NEW_MEMBER" });
      expect(items.find((i) => i.id === id)?.hbcId).toBeNull();
    });
  });

  it("can't be stored without an HBC unless it is a new member's (database CHECK)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const code = await tx
        .transaction((savepoint) =>
          savepoint.execute(sql`
            INSERT INTO registration_revision
              (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
               adult_declared, transfer_consent, is_new_member, privacy_notice_version)
            VALUES (${id}, 9, 'Test Person', '42', '+254700105999', NULL, true, true, false, 'v')`),
        )
        .then(
          () => undefined,
          (error: unknown) => (error as { cause?: { code?: string } }).cause?.code,
        );
      expect(code).toBe("23514");
    });
  });

  it("can't be approved until the HBC is set, even with an FWO number (BR-04)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      // Only the Secretary's step sets an FWO number; here the owner forces one in, to show that
      // approval refuses a missing HBC on its own.
      await asOwner(tx, () =>
        tx.execute(
          sql`UPDATE registration_revision SET fwo_number = '105001' WHERE registration_id = ${id}`,
        ),
      );
      expect(
        await approveRegistration(tx, {
          registrationId: id,
          version: await versionOf(tx, id),
          actor: SECRETARY,
        }),
      ).toEqual({ ok: false, reason: "no_hbc" });
    });
  });

  it("gets its HBC from the Church Secretary with the FWO number, then can be approved", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "105000", actor: SECRETARY });
      const id = await registered(tx);

      expect(await issue(tx, id, "105001")).toEqual({ ok: false, reason: "hbc_required" });
      expect(await issue(tx, id, "105001", randomUUID())).toEqual({
        ok: false,
        reason: "hbc_unavailable",
      });
      // A deactivated HBC can't be chosen (BR-04).
      const bethlehemA = await hbcId(tx, "Bethlehem A");
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE hbc SET is_active = false WHERE id = ${bethlehemA}`),
      );
      expect(await issue(tx, id, "105001", bethlehemA)).toEqual({
        ok: false,
        reason: "hbc_unavailable",
      });
      const samaria = await hbcId(tx, "Samaria");
      expect(await issue(tx, id, "105001", samaria)).toEqual({ ok: true });

      const revision = await tx.execute<{ hbc_id: string; fwo_number: string }>(sql`
        SELECT hbc_id, fwo_number FROM registration_revision
         WHERE registration_id = ${id} AND revision_no = 2`);
      expect(revision.rows[0]).toEqual({ hbc_id: samaria, fwo_number: "105001" });
      const audit = await tx.execute<{ after: Record<string, unknown> }>(sql`
        SELECT after FROM audit_entry WHERE action = 'registration.issue_fwo' AND request_id = 'req-105'`);
      expect(audit.rows[0]!.after).toMatchObject({ hbcId: samaria });

      const approved = await approveRegistration(tx, {
        registrationId: id,
        version: await versionOf(tx, id),
        actor: SECRETARY,
      });
      expect(approved).toMatchObject({ ok: true });
      const member = await tx.execute<{ hbc: string }>(sql`
        SELECT h.name AS hbc FROM member m
          JOIN member_hbc_assignment a ON a.member_id = m.id AND a.valid_to IS NULL
          JOIN hbc h ON h.id = a.hbc_id
         WHERE m.source_registration_id = ${id}`);
      expect(member.rows[0]!.hbc).toBe("Samaria");
    });
  });

  it("keeps the HBC a new member chose; the Secretary's choice is ignored then", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await setHighestFwoIssued(tx, { value: "105000", actor: SECRETARY });
      const judea = await hbcId(tx, "Judea");
      const id = await registered(tx, { hbcUnknown: false, hbcId: judea });
      expect(await issue(tx, id, "105002", await hbcId(tx, "Samaria"))).toEqual({ ok: true });
      const revision = await tx.execute<{ hbc_id: string }>(sql`
        SELECT hbc_id FROM registration_revision WHERE registration_id = ${id} AND revision_no = 2`);
      expect(revision.rows[0]!.hbc_id).toBe(judea);
    });
  });
});
