import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { createMember } from "../../src/modules/membership";
import {
  approveRegistration,
  checkAssistedRegistration,
  listQueueEvents,
  listReviewQueue,
  openRegistrationForReview,
  rejectRegistration,
  requestCorrection,
  submitAssistedRegistration,
  type AssistedRegistrationFields,
} from "../../src/modules/registration";
import { connectTestDrizzle, rolledBack } from "./db";

// The review queue and decisions (issue #19, FR-4) against real Postgres, as app_runtime.
// Registrations are made at the desk (#18) with IN_PERSON evidence, so no OTP is needed. All
// people are synthetic; staff are made-up user ids.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-19" } as const;
const ADMIN = { type: "STAFF", userId: "test-admin-19" } as const;

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

let phoneCounter = 0;

/** A SUBMITTED assisted registration, captured by `officer`. */
async function registered(
  tx: Transaction,
  over: Partial<AssistedRegistrationFields> = {},
  officer: { type: "STAFF"; userId: string } = OFFICER,
) {
  phoneCounter++;
  const checked = checkAssistedRegistration({
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: `55${String(phoneCounter).padStart(4, "0")}`,
    noPersonalPhone: false,
    phone: `0700 001 ${String(phoneCounter).padStart(3, "0")}`,
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
    { submissionId: randomUUID(), registration: checked.value, officer, language: "sw" },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test registration refused");
  return result.registrationId;
}

async function versionOf(tx: Transaction, registrationId: string): Promise<number> {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${registrationId}`,
  );
  return rows[0]!.version;
}

async function count(tx: Transaction, table: string) {
  const { rows } = await tx.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
  );
  return rows[0]!.n;
}

async function counts(tx: Transaction) {
  return {
    member: await count(tx, "member"),
    decision: await count(tx, "registration_decision"),
    audit: await count(tx, "audit_entry"),
    sms: await count(tx, "sms_outbox"),
  };
}

const approve = async (
  tx: Transaction,
  id: string,
  actor: { type: "STAFF"; userId: string } = ADMIN,
) => approveRegistration(tx, { registrationId: id, version: await versionOf(tx, id), actor });

describe("listReviewQueue (FR-4)", () => {
  it("lists SUBMITTED registrations oldest first, with FR-4's filters", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const first = await registered(tx, { isNewMember: true, fwoNumber: "" });
      const second = await registered(tx, {
        hbcId: await idOf(tx, "hbc", "Samaria"),
        eventLabel: "Samaria HBC AGM, 24 Jan 2027",
      });
      const decided = await registered(tx);
      await rejectRegistration(tx, {
        registrationId: decided,
        version: await versionOf(tx, decided),
        reason: "Duplicate",
        actor: ADMIN,
      });

      const ids = async (filters = {}) =>
        (await listReviewQueue(tx, filters)).items
          .map((i) => i.id)
          .filter((id) => [first, second, decided].includes(id));
      // Oldest first. In one test transaction every registration shares now(), so they tie on
      // submittedAt and the id breaks the tie; in production each is its own transaction.
      const { items } = await listReviewQueue(tx);
      const times = items.map((i) => i.submittedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect((await ids()).sort()).toEqual([first, second].sort());
      expect(await ids({ hbcId: await idOf(tx, "hbc", "Samaria") })).toEqual([second]);
      expect(await ids({ channel: "SELF" })).toEqual([]);
      expect((await ids({ channel: "ASSISTED" })).sort()).toEqual([first, second].sort());
      expect(await ids({ flag: "NEW_MEMBER" })).toEqual([first]);
      expect(await ids({ eventLabel: "Samaria HBC AGM, 24 Jan 2027" })).toEqual([second]);
      expect(await listReviewQueue(tx, { hbcId: "not-a-uuid" })).toEqual({ items: [], total: 0 });
      expect(await listQueueEvents(tx)).toEqual(
        expect.arrayContaining(["Judea HBC AGM, 17 Jan 2027", "Samaria HBC AGM, 24 Jan 2027"]),
      );
    });
  });

  it("filters by the conflict flags (BR-03, BR-06)", async () => {
    await rolledBack(db, async (tx) => {
      await asOwner(tx, () =>
        tx.execute(sql`INSERT INTO member (fwo_number, full_name, phone_e164)
                       VALUES ('7700', 'Existing Member', '+254700009001')`),
      );
      const fwo = await registered(tx, { fwoNumber: "7700" });
      const phone = await registered(tx, { phone: "0700009001" });
      const ids = async (flag: "FWO_CONFLICT" | "PHONE_CONFLICT") =>
        (await listReviewQueue(tx, { flag })).items.map((i) => i.id);
      expect(await ids("FWO_CONFLICT")).toContain(fwo);
      expect(await ids("FWO_CONFLICT")).not.toContain(phone);
      expect(await ids("PHONE_CONFLICT")).toContain(phone);
      expect(await ids("PHONE_CONFLICT")).not.toContain(fwo);
    });
  });
});

describe("openRegistrationForReview (FR-4, D31)", () => {
  it("records the access before returning the details", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const opened = await openRegistrationForReview(tx, {
        registrationId: id,
        actor: ADMIN,
        requestId: "req-view",
      });
      expect(opened).toMatchObject({
        id,
        channel: "ASSISTED",
        status: "SUBMITTED",
        capturedByUserId: OFFICER.userId,
        details: { fullName: "Test Person", noPersonalPhone: false },
        evidence: [{ kind: "IN_PERSON", actorUserId: OFFICER.userId }],
        decisions: [],
        live: { fwoHeldByMember: false, phoneHeldByMember: false, fwoInOpenRegistrations: [] },
      });
      expect(opened!.details.departmentIds).toHaveLength(1);
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        SELECT action, actor_id, request_id FROM audit_entry
         WHERE entity_id = ${id} AND action = 'registration.view'`);
      expect(rows).toEqual([
        { action: "registration.view", actor_id: ADMIN.userId, request_id: "req-view" },
      ]);
    });
  });

  it("finds nothing, and records nothing, for an unknown or malformed id", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await count(tx, "audit_entry");
      for (const registrationId of [randomUUID(), "REG-ABCDE", ""]) {
        expect(await openRegistrationForReview(tx, { registrationId, actor: ADMIN })).toBeNull();
      }
      expect(await count(tx, "audit_entry")).toBe(before);
    });
  });
});

describe("approveRegistration (FR-4, BR-08)", () => {
  it("creates the member, HBC period and declared departments, all in one transaction", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, { fwoNumber: "0091", phone: "0700 009 100" });
      const version = await versionOf(tx, id);
      const result = await approveRegistration(tx, {
        registrationId: id,
        version,
        actor: ADMIN,
        requestId: "req-approve",
      });
      expect(result).toMatchObject({ ok: true });
      const { memberId, smsId } = result as { memberId: string; smsId: string };

      const reg = await tx.execute<Record<string, unknown>>(sql`
        SELECT status, member_id, version, decided_at IS NOT NULL AS decided
          FROM registration WHERE id = ${id}`);
      expect(reg.rows[0]).toEqual({
        status: "APPROVED",
        member_id: memberId,
        version: version + 1,
        decided: true,
      });
      const member = await tx.execute<Record<string, unknown>>(sql`
        SELECT fwo_number, full_name, phone_e164, status, language, source_registration_id
          FROM member WHERE id = ${memberId}`);
      expect(member.rows[0]).toEqual({
        fwo_number: "91", // typed as 0091: leading zeros don't count (D61)
        full_name: "Test Person",
        phone_e164: "+254700009100",
        status: "ACTIVE",
        language: "sw",
        source_registration_id: id,
      });
      const hbc = await tx.execute<{ hbc_id: string; open: boolean }>(sql`
        SELECT hbc_id, valid_to IS NULL AS open FROM member_hbc_assignment WHERE member_id = ${memberId}`);
      expect(hbc.rows).toEqual([{ hbc_id: await idOf(tx, "hbc", "Judea"), open: true }]);
      const departments = await tx.execute<{ state: string; open: boolean }>(sql`
        SELECT state, valid_to IS NULL AS open FROM department_membership WHERE member_id = ${memberId}`);
      expect(departments.rows).toEqual([{ state: "DECLARED", open: true }]);

      const decision = await tx.execute<Record<string, unknown>>(sql`
        SELECT action, reason, actor_user_id FROM registration_decision WHERE registration_id = ${id}`);
      expect(decision.rows).toEqual([
        { action: "APPROVE", reason: null, actor_user_id: ADMIN.userId },
      ]);
      const audit = await tx.execute<Record<string, unknown>>(sql`
        SELECT action, entity_type, actor_id, after FROM audit_entry
         WHERE request_id = 'req-approve' ORDER BY id`);
      expect(audit.rows).toEqual([
        {
          action: "member.create",
          entity_type: "member",
          actor_id: ADMIN.userId,
          after: {
            status: "ACTIVE",
            sourceRegistrationId: id,
            hbcId: await idOf(tx, "hbc", "Judea"),
            departments: 1,
            noPersonalPhone: false,
          },
        },
        {
          action: "registration.approve",
          entity_type: "registration",
          actor_id: ADMIN.userId,
          after: { status: "APPROVED", memberId },
        },
      ]);
      const sms = await tx.execute<Record<string, unknown>>(sql`
        SELECT phone_e164, template, language FROM sms_outbox WHERE id = ${smsId}`);
      expect(sms.rows[0]).toEqual({
        phone_e164: "+254700009100",
        template: "registration.approved",
        language: "sw",
      });
    });
  });

  it("approves a member with no personal phone, without an SMS", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, { noPersonalPhone: true, phone: "" });
      const result = await approve(tx, id);
      expect(result).toMatchObject({ ok: true, smsId: null });
      const member = await tx.execute<{ phone_e164: string | null }>(
        sql`SELECT phone_e164 FROM member WHERE source_registration_id = ${id}`,
      );
      expect(member.rows).toEqual([{ phone_e164: null }]);
    });
  });

  it("fails as stale when someone else acted first, writing nothing (FR-4)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const seen = await versionOf(tx, id);
      expect((await approve(tx, id)).ok).toBe(true);
      const before = await counts(tx);
      const second = { registrationId: id, version: seen, actor: ADMIN };
      expect(await approveRegistration(tx, second)).toEqual({ ok: false, reason: "stale" });
      expect(await rejectRegistration(tx, { ...second, reason: "Too late" })).toEqual({
        ok: false,
        reason: "stale",
      });
      expect(await counts(tx)).toEqual(before);
    });
  });

  it("refuses the officer who captured it (BR-10); another administrator approves (D36)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, {}, ADMIN);
      const before = await counts(tx);
      expect(await approve(tx, id, ADMIN)).toEqual({ ok: false, reason: "captured_by_you" });
      expect(await counts(tx)).toEqual(before);
      const superAdmin = { type: "STAFF", userId: "test-super-admin-19" } as const;
      expect((await approve(tx, id, superAdmin)).ok).toBe(true);
    });
  });

  it("lets the capturing officer reject or ask for a correction (BR-10 covers approval only)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, {}, ADMIN);
      const result = await rejectRegistration(tx, {
        registrationId: id,
        version: await versionOf(tx, id),
        reason: "Registered twice",
        actor: ADMIN,
      });
      expect(result.ok).toBe(true);
    });
  });

  it("refuses a new member until an FWO number is entered (BR-16)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, { isNewMember: true, fwoNumber: "" });
      expect(await approve(tx, id)).toEqual({ ok: false, reason: "no_fwo" });
    });
  });

  it("checks conflicts again at approval, whatever the flags said at submission", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const fwo = await registered(tx, { fwoNumber: "7701" });
      const phone = await registered(tx, { phone: "0700009002" });
      // Members created after both were submitted, so neither was flagged.
      await asOwner(tx, () =>
        tx.execute(sql`INSERT INTO member (fwo_number, full_name, phone_e164) VALUES
                         ('7701', 'Existing Member', NULL),
                         ('7702', 'Other Member', '+254700009002')`),
      );
      const before = await counts(tx);
      expect(await approve(tx, fwo)).toEqual({ ok: false, reason: "fwo_held" });
      expect(await approve(tx, phone)).toEqual({ ok: false, reason: "phone_held" });
      expect(await counts(tx)).toEqual(before);
    });
  });

  it("refuses while another open registration has the same FWO, until it is rejected (BR-03, FR-4)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const holder = await registered(tx, { fwoNumber: "7710" });
      const duplicate = await registered(tx, { fwoNumber: "7710" });
      const { rows } = await tx.execute<{ reference: string }>(
        sql`SELECT reference FROM registration WHERE id = ${holder}`,
      );
      const opened = await openRegistrationForReview(tx, {
        registrationId: duplicate,
        actor: ADMIN,
      });
      expect(opened!.live.fwoInOpenRegistrations).toEqual([rows[0]!.reference]);

      const before = await counts(tx);
      expect(await approve(tx, duplicate)).toEqual({
        ok: false,
        reason: "fwo_in_open_registration",
      });
      expect(await approve(tx, holder)).toEqual({ ok: false, reason: "fwo_in_open_registration" });
      expect(await counts(tx)).toEqual(before);

      // The administrator rejects the duplicate; the real holder can then be approved.
      await rejectRegistration(tx, {
        registrationId: duplicate,
        version: await versionOf(tx, duplicate),
        reason: "Same FWO as the earlier registration",
        actor: ADMIN,
      });
      expect((await approve(tx, holder)).ok).toBe(true);
    });
  });

  it("asks nothing about conflicts once approved: the FWO is its own member's", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      expect((await approve(tx, id)).ok).toBe(true);
      const opened = await openRegistrationForReview(tx, { registrationId: id, actor: ADMIN });
      expect(opened!.live).toEqual({
        fwoHeldByMember: false,
        phoneHeldByMember: false,
        fwoInOpenRegistrations: [],
        phoneInOpenRegistrations: [],
      });
    });
  });

  it("flags two open registrations sharing a phone for each other, names the other and blocks approval until one is resolved (#158, D28)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const first = await registered(tx, { phone: "0700 009 101" });
      const second = await registered(tx, { phone: "0700 009 101" });
      const unrelated = await registered(tx);
      const ids = (await listReviewQueue(tx, { flag: "PHONE_CONFLICT" })).items.map((i) => i.id);
      expect(ids).toEqual(expect.arrayContaining([first, second]));
      expect(ids).not.toContain(unrelated);

      const referenceOf = async (id: string) =>
        (
          await tx.execute<{ reference: string }>(
            sql`SELECT reference FROM registration WHERE id = ${id}`,
          )
        ).rows[0]!.reference;
      const live = async (id: string) =>
        (await openRegistrationForReview(tx, { registrationId: id, actor: ADMIN }))!.live;
      expect((await live(first)).phoneInOpenRegistrations).toEqual([await referenceOf(second)]);
      expect((await live(second)).phoneInOpenRegistrations).toEqual([await referenceOf(first)]);

      // Neither is approved until the administrator has called both and one is resolved (D28).
      const before = await counts(tx);
      for (const id of [first, second]) {
        expect(await approve(tx, id)).toEqual({ ok: false, reason: "phone_in_open_registration" });
      }
      expect(await counts(tx)).toEqual(before);
      await rejectRegistration(tx, {
        registrationId: second,
        version: await versionOf(tx, second),
        reason: "Uses a relative's phone; will register at the desk",
        actor: ADMIN,
      });
      expect((await live(first)).phoneInOpenRegistrations).toEqual([]);
      expect((await approve(tx, first)).ok).toBe(true);
    });
  });

  it("doesn't flag registrations with no personal phone for each other (BR-06)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const a = await registered(tx, { noPersonalPhone: true, phone: "" });
      const b = await registered(tx, { noPersonalPhone: true, phone: "" });
      const ids = (await listReviewQueue(tx, { flag: "PHONE_CONFLICT" })).items.map((i) => i.id);
      expect(ids).not.toContain(a);
      expect(ids).not.toContain(b);
    });
  });

  it("refuses when the HBC was deactivated since (BR-04)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const hbcId = await idOf(tx, "hbc", "Damascus");
      const id = await registered(tx, { hbcId });
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE hbc SET is_active = false WHERE id = ${hbcId}`),
      );
      expect(await approve(tx, id)).toEqual({ ok: false, reason: "units" });
    });
  });

  it("refuses an unknown or malformed id", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      for (const registrationId of [randomUUID(), "nope"]) {
        expect(await approveRegistration(tx, { registrationId, version: 0, actor: ADMIN })).toEqual(
          { ok: false, reason: "not_found" },
        );
      }
    });
  });
});

describe("createMember maps the database's own conflicts (race at approval)", () => {
  it("answers fwo_held or phone_held instead of a raw error, leaving the transaction usable", async () => {
    await rolledBack(db, async (tx) => {
      await asOwner(tx, () =>
        tx.execute(sql`INSERT INTO member (fwo_number, full_name, phone_e164)
                       VALUES ('7703', 'Existing Member', '+254700009003')`),
      );
      const source = await registered(tx);
      const hbcId = await idOf(tx, "hbc", "Judea");
      const base = {
        fullName: "Test Person",
        language: "en" as const,
        sourceRegistrationId: source,
        hbcId,
        departmentIds: [],
      };
      expect(
        await createMember(tx, { ...base, fwoNumber: "7703", phoneE164: null }, ADMIN),
      ).toEqual({ ok: false, reason: "fwo_held" });
      expect(
        await createMember(tx, { ...base, fwoNumber: "7704", phoneE164: "+254700009003" }, ADMIN),
      ).toEqual({ ok: false, reason: "phone_held" });
      // The savepoint rolled back; the transaction still works.
      expect(await count(tx, "member")).toBeGreaterThan(0);
    });
  });
});

describe("rejectRegistration and requestCorrection (FR-4)", () => {
  it("requires a reason", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const decision = { registrationId: id, version: await versionOf(tx, id), actor: ADMIN };
      await expect(rejectRegistration(tx, { ...decision, reason: "  " })).rejects.toThrow();
      await expect(requestCorrection(tx, { ...decision, reason: "x" })).rejects.toThrow();
    });
  });

  it("rejects with the reason, audited, without an SMS", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx);
      const sms = await count(tx, "sms_outbox");
      expect(
        await rejectRegistration(tx, {
          registrationId: id,
          version: await versionOf(tx, id),
          reason: "  Same person as REG-ABCDE  ",
          actor: ADMIN,
        }),
      ).toEqual({ ok: true, smsId: null });
      expect(await count(tx, "sms_outbox")).toBe(sms);
      const { rows } = await tx.execute<Record<string, unknown>>(sql`
        SELECT r.status, d.action, d.reason, a.after
          FROM registration r
          JOIN registration_decision d ON d.registration_id = r.id
          JOIN audit_entry a ON a.entity_id = r.id::text AND a.action = 'registration.reject'
         WHERE r.id = ${id}`);
      expect(rows).toEqual([
        {
          status: "REJECTED",
          action: "REJECT",
          reason: "Same person as REG-ABCDE",
          after: { status: "REJECTED", reason: "Same person as REG-ABCDE" },
        },
      ]);
      // Final: nothing more can happen to it.
      expect(await approve(tx, id)).toEqual({ ok: false, reason: "stale" });
    });
  });

  it("asks for a correction with an SMS to the member, or none without a phone", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await registered(tx, { phone: "0700 009 200" });
      const result = await requestCorrection(tx, {
        registrationId: id,
        version: await versionOf(tx, id),
        reason: "Wrong HBC: lives in Samaria",
        actor: ADMIN,
      });
      expect(result).toMatchObject({ ok: true });
      const sms = await tx.execute<Record<string, unknown>>(sql`
        SELECT phone_e164, template, language FROM sms_outbox
         WHERE id = ${(result as { smsId: string }).smsId}`);
      expect(sms.rows[0]).toEqual({
        phone_e164: "+254700009200",
        template: "registration.correction_requested",
        language: "sw",
      });
      const status = await tx.execute<{ status: string }>(
        sql`SELECT status FROM registration WHERE id = ${id}`,
      );
      expect(status.rows[0]!.status).toBe("CORRECTION_REQUESTED");

      const none = await registered(tx, { noPersonalPhone: true, phone: "" });
      expect(
        await requestCorrection(tx, {
          registrationId: none,
          version: await versionOf(tx, none),
          reason: "Spelling of name",
          actor: ADMIN,
        }),
      ).toEqual({ ok: true, smsId: null });
    });
  });
});
