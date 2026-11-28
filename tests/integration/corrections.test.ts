import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import {
  approveRegistration,
  checkAssistedRegistration,
  issueFwoNumber,
  listCorrections,
  openRegistrationForCorrection,
  openRegistrationForReview,
  PRIVACY_NOTICE_VERSION,
  requestCorrection,
  setHighestFwoIssued,
  submitAssistedRegistration,
  submitCorrection,
  type AssistedRegistrationFields,
  type CorrectionFields,
} from "../../src/modules/registration";
import { connectTestDrizzle, rolledBack } from "./db";

// Corrections by staff (issue #21, FR-5, BR-09, D35) against real Postgres, as app_runtime.
// Registrations are made at the desk with IN_PERSON evidence. All people are synthetic; staff
// are made-up user ids.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-21" } as const;
const ADMIN = { type: "STAFF", userId: "test-admin-21" } as const;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

let counter = 0;

/** A SUBMITTED assisted registration. */
async function registered(tx: Transaction, over: Partial<AssistedRegistrationFields> = {}) {
  counter++;
  const checked = checkAssistedRegistration({
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: `21${String(counter).padStart(4, "0")}`,
    noPersonalPhone: false,
    phone: `0700 021 ${String(counter).padStart(3, "0")}`,
    hbcId: await idOf(tx, "hbc", "Judea"),
    departmentIds: [await idOf(tx, "department", "English Choir")],
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

async function versionOf(tx: Transaction, id: string): Promise<number> {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${id}`,
  );
  return rows[0]!.version;
}

/** A registration an administrator has asked to be corrected. */
async function waitingForCorrection(
  tx: Transaction,
  over: Partial<AssistedRegistrationFields> = {},
) {
  const id = await registered(tx, over);
  const asked = await requestCorrection(tx, {
    registrationId: id,
    version: await versionOf(tx, id),
    reason: "Wrong HBC and the phone is a relative's",
    actor: ADMIN,
  });
  if (!asked.ok) throw new Error("test correction request refused");
  return id;
}

async function fieldsOf(tx: Transaction, over: Partial<CorrectionFields> = {}) {
  return {
    fullName: "Test Person Corrected",
    fwoNumber: "219999",
    noPersonalPhone: false,
    phone: "0711 021 999",
    hbcId: await idOf(tx, "hbc", "Samaria"),
    departmentIds: [await idOf(tx, "department", "Kiswahili Choir")],
    ...over,
  } satisfies CorrectionFields;
}

async function correct(
  tx: Transaction,
  id: string,
  fields: CorrectionFields,
  extra: {
    version?: number;
    consentToCurrentNotice?: boolean;
    actor?: { type: "STAFF"; userId: string };
  } = {},
) {
  return submitCorrection(tx, {
    registrationId: id,
    version: extra.version ?? (await versionOf(tx, id)),
    fields,
    consentToCurrentNotice: extra.consentToCurrentNotice,
    actor: extra.actor ?? OFFICER,
    requestId: "req-21",
  });
}

async function registrationRow(tx: Transaction, id: string) {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    SELECT status, current_revision_no, fwo_conflict, phone_conflict, version
      FROM registration WHERE id = ${id}`);
  return rows[0]!;
}

async function revisionRow(tx: Transaction, id: string, revisionNo: number) {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    SELECT full_name, fwo_number, phone_e164, no_personal_phone, hbc_id, is_new_member,
           privacy_notice_version, submitted_by_user_id
      FROM registration_revision WHERE registration_id = ${id} AND revision_no = ${revisionNo}`);
  return rows[0];
}

async function departmentsOf(tx: Transaction, id: string, revisionNo: number) {
  const { rows } = await tx.execute<{ department_id: string }>(sql`
    SELECT department_id FROM registration_revision_department
     WHERE registration_id = ${id} AND revision_no = ${revisionNo}`);
  return rows.map((r) => r.department_id);
}

async function smsCount(tx: Transaction) {
  const { rows } = await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sms_outbox`);
  return rows[0]!.n;
}

describe("listCorrections (FR-5)", () => {
  it("lists registrations waiting for a correction, longest waiting first, and nothing else", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const first = await waitingForCorrection(tx, { fullName: "Test First Waiting" });
      const second = await waitingForCorrection(tx, { fullName: "Test Second Waiting" });
      await registered(tx, { fullName: "Test Still Submitted" });
      const { items, total } = await listCorrections(tx);
      expect(total).toBe(2);
      // Both requests share this transaction's now(), so their order here is a tie.
      expect(items.map((i) => i.id).sort()).toEqual([first, second].sort());
      expect(items.find((i) => i.id === first)).toMatchObject({
        fullName: "Test First Waiting",
        channel: "ASSISTED",
      });
      expect(items[0]!.requestedAt).toBeInstanceOf(Date);
      expect(items[0]!.requestedAt.getTime()).toBeLessThanOrEqual(items[1]!.requestedAt.getTime());
      // Listing is not access to one record (D31): nothing is audited.
      const { rows } = await tx.execute(
        sql`SELECT 1 FROM audit_entry WHERE action = 'registration.view'`,
      );
      expect(rows).toHaveLength(0);
    });
  });
});

describe("openRegistrationForCorrection (FR-5, D31)", () => {
  it("opens only a registration waiting for a correction, recording the access", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const views = async () => {
        const { rows } = await tx.execute<{ n: number }>(
          sql`SELECT count(*)::int AS n FROM audit_entry WHERE action = 'registration.view'`,
        );
        return rows[0]!.n;
      };
      // An officer can't use the correction page to read other registrations: nothing is read
      // and nothing recorded.
      const submitted = await registered(tx);
      expect(
        await openRegistrationForCorrection(tx, { registrationId: submitted, actor: OFFICER }),
      ).toBe("not_waiting");
      expect(
        await openRegistrationForCorrection(tx, { registrationId: randomUUID(), actor: OFFICER }),
      ).toBeNull();
      expect(
        await openRegistrationForCorrection(tx, { registrationId: "nope", actor: OFFICER }),
      ).toBeNull();
      expect(await views()).toBe(0);

      const id = await waitingForCorrection(tx);
      const reg = await openRegistrationForCorrection(tx, { registrationId: id, actor: OFFICER });
      expect(reg).toMatchObject({ id, status: "CORRECTION_REQUESTED" });
      expect(await views()).toBe(1);
    });
  });
});

describe("submitCorrection (FR-5, BR-09)", () => {
  it("adds revision n + 1 and returns the registration to SUBMITTED, audited, without an SMS", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx);
      const before = await revisionRow(tx, id, 1);
      const version = await versionOf(tx, id);
      const sms = await smsCount(tx);
      const fields = await fieldsOf(tx);

      expect(await correct(tx, id, fields)).toEqual({ ok: true });

      expect(await registrationRow(tx, id)).toEqual({
        status: "SUBMITTED",
        current_revision_no: 2,
        fwo_conflict: false,
        phone_conflict: false,
        version: version + 1,
      });
      expect(await revisionRow(tx, id, 2)).toEqual({
        full_name: "Test Person Corrected",
        fwo_number: "219999",
        phone_e164: "+254711021999",
        no_personal_phone: false,
        hbc_id: fields.hbcId,
        is_new_member: false,
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
        submitted_by_user_id: OFFICER.userId,
      });
      expect(await departmentsOf(tx, id, 2)).toEqual(fields.departmentIds);
      // BR-09: the previous revision is untouched.
      expect(await revisionRow(tx, id, 1)).toEqual(before);
      // No SMS: the member asked to contact the office has done so.
      expect(await smsCount(tx)).toBe(sms);

      const audit = await tx.execute<Record<string, unknown>>(sql`
        SELECT actor_type, actor_id, entity_type, entity_id, before, after, request_id
          FROM audit_entry WHERE action = 'registration.correct'`);
      expect(audit.rows).toEqual([
        {
          actor_type: "STAFF",
          actor_id: OFFICER.userId,
          entity_type: "registration",
          entity_id: id,
          before: { status: "CORRECTION_REQUESTED", revisionNo: 1 },
          after: {
            status: "SUBMITTED",
            revisionNo: 2,
            changed: ["fullName", "fwoNumber", "phone", "hbc", "departments"],
            fwoConflict: false,
            phoneConflict: false,
          },
          request_id: "req-21",
        },
      ]);
      // Names of details only, never their values (BR-14).
      expect(JSON.stringify(audit.rows)).not.toMatch(/Corrected|219999|711021999/);
    });
  });

  it("shows the earlier revisions to the reviewer, and the corrected details can be approved", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx, { fullName: "Test Before Correction" });
      await correct(tx, id, await fieldsOf(tx), { actor: ADMIN });

      const reg = await openRegistrationForReview(tx, { registrationId: id, actor: ADMIN });
      expect(reg).toMatchObject({
        status: "SUBMITTED",
        revisionNo: 2,
        details: { fullName: "Test Person Corrected", submittedByUserId: ADMIN.userId },
      });
      expect(reg!.earlierRevisions).toHaveLength(1);
      expect(reg!.earlierRevisions[0]).toMatchObject({
        revisionNo: 1,
        fullName: "Test Before Correction",
        departmentIds: [await idOf(tx, "department", "English Choir")],
      });

      // D28: the administrator who recorded the correction approves it.
      const approved = await approveRegistration(tx, {
        registrationId: id,
        version: reg!.version,
        actor: ADMIN,
      });
      expect(approved).toMatchObject({ ok: true });
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        SELECT full_name, fwo_number, phone_e164 FROM member WHERE source_registration_id = ${id}`);
      expect(rows).toEqual([
        { full_name: "Test Person Corrected", fwo_number: "219999", phone_e164: "+254711021999" },
      ]);
    });
  });

  it("refuses unless the registration is waiting for a correction at the version seen, writing nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const fields = await fieldsOf(tx);
      const submitted = await registered(tx);
      expect(await correct(tx, submitted, fields)).toEqual({ ok: false, reason: "stale" });

      const id = await waitingForCorrection(tx);
      const seen = await versionOf(tx, id);
      expect(await correct(tx, id, fields, { version: seen - 1 })).toEqual({
        ok: false,
        reason: "stale",
      });
      // Two staff members correcting the same registration: the second is stale.
      expect(await correct(tx, id, fields, { version: seen })).toEqual({ ok: true });
      expect(await correct(tx, id, fields, { version: seen })).toEqual({
        ok: false,
        reason: "stale",
      });
      expect(await correct(tx, randomUUID(), fields, { version: 0 })).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await correct(tx, "not-a-uuid", fields, { version: 0 })).toEqual({
        ok: false,
        reason: "not_found",
      });

      const { rows } = await tx.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM registration_revision WHERE registration_id = ${submitted}`);
      expect(rows[0]!.n).toBe(1);
      const audit = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM audit_entry WHERE action = 'registration.correct'`,
      );
      expect(audit.rows[0]!.n).toBe(1);
    });
  });

  it("answers field errors by field, and refuses an inactive HBC or department (BR-04)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx);
      expect(
        await correct(
          tx,
          id,
          await fieldsOf(tx, { fullName: " ", fwoNumber: "12a", phone: "12345", hbcId: "" }),
        ),
      ).toEqual({
        ok: false,
        reason: "invalid",
        errors: { fullName: "required", fwoNumber: "invalid", phone: "invalid", hbcId: "required" },
      });
      const samaria = await idOf(tx, "hbc", "Samaria");
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE hbc SET is_active = false WHERE id = ${samaria}`),
      );
      expect(await correct(tx, id, await fieldsOf(tx))).toEqual({ ok: false, reason: "units" });
      expect((await registrationRow(tx, id)).status).toBe("CORRECTION_REQUESTED");
    });
  });

  it("records no personal phone (BR-06), dropping whatever was typed in the phone field", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx);
      const fields = await fieldsOf(tx, { noPersonalPhone: true, phone: "0711 021 998" });
      expect(await correct(tx, id, fields)).toEqual({ ok: true });
      expect(await revisionRow(tx, id, 2)).toMatchObject({
        phone_e164: null,
        no_personal_phone: true,
      });
    });
  });

  it("works the conflict flags out again for the corrected details (BR-03, BR-06, D28)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      // A phone that belongs to another member, flagged at submission.
      await asOwner(tx, () =>
        tx.execute(sql`
          INSERT INTO member (fwo_number, full_name, phone_e164)
          VALUES ('218888', 'Test Existing Member', '+254700021777')`),
      );
      const id = await waitingForCorrection(tx, { phone: "0700 021 777" });
      expect(await registrationRow(tx, id)).toMatchObject({ phone_conflict: true });

      // D28: the registrant gives a number of their own; the flag clears. Their own FWO number,
      // carried over, doesn't conflict with their own open registration.
      const own = (await revisionRow(tx, id, 1))!.fwo_number as string;
      expect(await correct(tx, id, await fieldsOf(tx, { fwoNumber: own }))).toEqual({ ok: true });
      expect(await registrationRow(tx, id)).toMatchObject({
        fwo_conflict: false,
        phone_conflict: false,
      });

      // A correction to a member's FWO number is accepted and flagged (BR-03).
      const other = await waitingForCorrection(tx);
      expect(await correct(tx, other, await fieldsOf(tx, { fwoNumber: "218888" }))).toEqual({
        ok: true,
      });
      expect(await registrationRow(tx, other)).toMatchObject({ fwo_conflict: true });
    });
  });

  it("flags both when the corrected FWO number or phone is another open registration's (#158, #163)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const other = await registered(tx, { fwoNumber: "219555", phone: "0711 021 555" });
      expect(await registrationRow(tx, other)).toMatchObject({
        fwo_conflict: false,
        phone_conflict: false,
      });
      const id = await waitingForCorrection(tx);
      expect(
        await correct(tx, id, await fieldsOf(tx, { fwoNumber: "219555", phone: "0711 021 555" })),
      ).toEqual({
        ok: true,
      });
      for (const row of [id, other]) {
        expect(await registrationRow(tx, row)).toMatchObject({
          fwo_conflict: true,
          phone_conflict: true,
        });
      }
      const { rows } = await tx.execute(sql`
        SELECT actor_type, actor_id, after FROM audit_entry
         WHERE entity_id = ${other} AND action = 'registration.flag_conflict'`);
      expect(rows).toEqual([
        {
          actor_type: "STAFF",
          actor_id: OFFICER.userId,
          after: { fwoConflict: true, phoneConflict: true, cause: "another_registration" },
        },
      ]);
    });
  });

  it("carries the consent over unless the privacy notice changed; then it must be confirmed (D35)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx);
      await asOwner(tx, () =>
        tx.execute(sql`
          UPDATE registration_revision SET privacy_notice_version = '2026-01-01'
           WHERE registration_id = ${id}`),
      );
      const fields = await fieldsOf(tx);
      expect(await correct(tx, id, fields)).toEqual({ ok: false, reason: "notice_changed" });
      expect(await correct(tx, id, fields, { consentToCurrentNotice: true })).toEqual({ ok: true });
      expect(await revisionRow(tx, id, 2)).toMatchObject({
        privacy_notice_version: PRIVACY_NOTICE_VERSION,
      });
      const { rows } = await tx.execute<{ after: { consentToNotice?: string } }>(
        sql`SELECT after FROM audit_entry WHERE action = 'registration.correct'`,
      );
      expect(rows[0]!.after.consentToNotice).toBe(PRIVACY_NOTICE_VERSION);

      // Unchanged notice: the version the member consented to carries over, no tick needed.
      const unchanged = await waitingForCorrection(tx);
      expect(await correct(tx, unchanged, fields)).toEqual({ ok: true });
      const audit = await tx.execute<{ after: Record<string, unknown> }>(sql`
        SELECT after FROM audit_entry
         WHERE action = 'registration.correct' AND entity_id = ${unchanged}`);
      expect(audit.rows[0]!.after).not.toHaveProperty("consentToNotice");
    });
  });

  it("keeps a new member's FWO number the Secretary's (BR-16), and their HBC unknown only until it is issued (D49)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      // Still waiting for a number: the form's FWO number is ignored, the HBC may stay unknown.
      const waiting = await waitingForCorrection(tx, {
        isNewMember: true,
        fwoNumber: "",
        hbcUnknown: true,
        hbcId: "",
      });
      expect(
        await correct(tx, waiting, await fieldsOf(tx, { hbcId: "", hbcUnknown: true })),
      ).toEqual({ ok: true });
      expect(await revisionRow(tx, waiting, 2)).toMatchObject({
        fwo_number: null,
        hbc_id: null,
        is_new_member: true,
      });

      // Number issued: it carries over whatever the form says, and the HBC is required.
      await setHighestFwoIssued(tx, { value: "210000", actor: ADMIN });
      const issued = await registered(tx, { isNewMember: true, fwoNumber: "" });
      expect(
        await issueFwoNumber(tx, {
          registrationId: issued,
          version: await versionOf(tx, issued),
          fwoNumber: "210001",
          actor: ADMIN,
        }),
      ).toEqual({ ok: true });
      await requestCorrection(tx, {
        registrationId: issued,
        version: await versionOf(tx, issued),
        reason: "Name misspelt",
        actor: ADMIN,
      });
      expect(
        await correct(tx, issued, await fieldsOf(tx, { hbcId: "", hbcUnknown: true })),
      ).toEqual({ ok: false, reason: "hbc_required" });
      expect(await correct(tx, issued, await fieldsOf(tx, { fwoNumber: "777" }))).toEqual({
        ok: true,
      });
      expect(await revisionRow(tx, issued, 3)).toMatchObject({
        fwo_number: "210001",
        is_new_member: true,
      });
    });
  });

  it("marks phone-code evidence that checked a number the correction replaced", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await waitingForCorrection(tx, { phone: "0700 021 555" });
      await asOwner(tx, () =>
        tx.execute(sql`
          INSERT INTO verification_evidence (registration_id, kind, phone_e164)
          VALUES (${id}, 'PHONE_OTP', '+254700021555')`),
      );
      const before = await openRegistrationForReview(tx, { registrationId: id, actor: ADMIN });
      expect(before!.evidence.find((e) => e.kind === "PHONE_OTP")?.forEarlierPhone).toBe(false);
      expect(await correct(tx, id, await fieldsOf(tx))).toEqual({ ok: true });
      const after = await openRegistrationForReview(tx, { registrationId: id, actor: ADMIN });
      expect(after!.evidence.find((e) => e.kind === "PHONE_OTP")?.forEarlierPhone).toBe(true);
    });
  });
});
