import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { membershipOverview } from "../../src/modules/membership";
import { reserveSms, smsUsageToday, type SmsProvider } from "../../src/modules/notifications";
import {
  approveRegistration,
  checkAssistedRegistration,
  checkSelfRegistration,
  deskOverview,
  OVERVIEW_DAYS,
  registrationOverview,
  rejectRegistration,
  requestCorrection,
  submitAssistedRegistration,
  submitSelfRegistration,
  type AssistedRegistrationFields,
} from "../../src/modules/registration";
import { requestPhoneChallenge, verifyPhoneChallenge } from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";

// The staff dashboard's figures against real Postgres, as app_runtime. Each test compares the
// figures before and after its own registrations, so rows left by other tests don't matter. All
// people are synthetic; staff are made-up user ids.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const ADMIN = { type: "STAFF", userId: "test-admin-overview" } as const;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

let counter = 0;

/** A SUBMITTED assisted registration taken by `officer`; returns its id and version. */
async function registered(
  tx: Transaction,
  officer: string,
  over: Partial<AssistedRegistrationFields> = {},
) {
  counter++;
  const checked = checkAssistedRegistration({
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: `77${String(counter).padStart(4, "0")}`,
    noPersonalPhone: false,
    phone: `0700 077 ${String(counter).padStart(3, "0")}`,
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
    {
      submissionId: randomUUID(),
      registration: checked.value,
      officer: { type: "STAFF", userId: officer },
      language: "en",
    },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test registration refused");
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${result.registrationId}`,
  );
  return { registrationId: result.registrationId, version: rows[0]!.version };
}

/** A SUBMITTED self-registration, through the real OTP flow with fakes around it. */
async function selfRegistered(tx: Transaction) {
  counter++;
  const checked = checkSelfRegistration({
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: `78${String(counter).padStart(4, "0")}`,
    phone: `0700 078 ${String(counter).padStart(3, "0")}`,
    hbcId: await idOf(tx, "hbc", "Judea"),
    departmentIds: [],
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
  });
  if (!checked.ok) throw new Error("test fields invalid");
  const sent: string[] = [];
  const provider: SmsProvider = {
    send: async (message) => {
      sent.push(message.text);
      return { outcome: "accepted", messageId: "m" };
    },
    balance: async () => 0,
  };
  const fetch = (async () =>
    new Response(JSON.stringify({ success: true }))) as unknown as typeof globalThis.fetch;
  const request = await requestPhoneChallenge(
    tx,
    {
      phone: checked.value.phoneE164,
      purpose: "REGISTRATION",
      language: "en",
      ip: "198.51.100.78",
      turnstileToken: "t",
    },
    { otpSecret: OTP_SECRET, rateLimitSecret: "rl-secret", turnstileSecret: "ts", provider, fetch },
  );
  const challengeId = (request as { challengeId: string }).challengeId;
  const code = /\b([0-9]{6})\b/.exec(sent[0]!)![1]!;
  const verified = await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET);
  const result = await submitSelfRegistration(
    tx,
    {
      registration: checked.value,
      language: "en",
      verificationToken: (verified as { token: string }).token,
    },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test self-registration refused");
}

describe("the staff dashboard's figures", () => {
  it("counts what waits, what was sent back and what was decided, with a 14-day series", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await registrationOverview(tx);
      expect(before.daily).toHaveLength(OVERVIEW_DAYS);

      const first = await registered(tx, "test-officer-overview");
      const second = await registered(tx, "test-officer-overview");
      const third = await registered(tx, "test-officer-overview");
      const fourth = await registered(tx, "test-officer-overview");
      await selfRegistered(tx);
      expect(await requestCorrection(tx, { ...second, reason: "Wrong HBC", actor: ADMIN })).toEqual(
        expect.objectContaining({ ok: true }),
      );
      expect(await approveRegistration(tx, { ...third, actor: ADMIN })).toMatchObject({ ok: true });
      expect(
        await rejectRegistration(tx, { ...fourth, reason: "Registered twice", actor: ADMIN }),
      ).toMatchObject({ ok: true });

      const after = await registrationOverview(tx);
      expect(after.waiting).toBe(before.waiting + 2);
      expect(after.toCorrect).toBe(before.toCorrect + 1);
      expect(after.approvedThisWeek).toBe(before.approvedThisWeek + 1);
      expect(after.rejectedThisWeek).toBe(before.rejectedThisWeek + 1);
      // The oldest is no later than the one just made.
      const { rows } = await tx.execute<{ created_at: Date }>(
        sql`SELECT created_at FROM registration WHERE id = ${first.registrationId}`,
      );
      expect(after.oldestWaitingAt!.getTime()).toBeLessThanOrEqual(
        new Date(rows[0]!.created_at).getTime(),
      );
      const today = after.daily.at(-1)!;
      expect(today.assisted).toBe(before.daily.at(-1)!.assisted + 4);
      expect(today.self).toBe(before.daily.at(-1)!.self + 1);
      // Oldest first, one row a day.
      expect(after.daily.map((d) => d.day)).toEqual(after.daily.map((d) => d.day).sort());
    });
  });

  it("counts the flags on what waits: shared FWO numbers, shared phones, new members", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await registrationOverview(tx);

      await registered(tx, "test-officer-overview", { isNewMember: true, fwoNumber: "" });
      // Two registrations with one FWO number, two with one phone: both of each pair are flagged.
      await registered(tx, "test-officer-overview", { fwoNumber: "779901" });
      await registered(tx, "test-officer-overview", { fwoNumber: "779901" });
      await registered(tx, "test-officer-overview", { phone: "0700 077 990" });
      await registered(tx, "test-officer-overview", { phone: "0700 077 990" });

      const after = await registrationOverview(tx);
      expect(after.newMembers).toBe(before.newMembers + 1);
      expect(after.fwoConflicts).toBe(before.fwoConflicts + 2);
      expect(after.phoneConflicts).toBe(before.phoneConflicts + 2);
      expect(after.waiting).toBe(before.waiting + 5);
    });
  });

  it("gives an officer only the count of their own desk registrations", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await registered(tx, "test-officer-a");
      await registered(tx, "test-officer-a");
      await registered(tx, "test-officer-b");
      expect(await deskOverview(tx, "test-officer-a")).toMatchObject({
        capturedToday: 2,
        capturedThisWeek: 2,
      });
      expect(await deskOverview(tx, "test-officer-nobody")).toMatchObject({
        capturedToday: 0,
        capturedThisWeek: 0,
      });
    });
  });

  it("counts active members, in all and in each HBC", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const judea = await idOf(tx, "hbc", "Judea");
      const before = await membershipOverview(tx);
      const inJudea = (o: typeof before) => o.byHbc.find((h) => h.hbcId === judea)!.active;

      const reg = await registered(tx, "test-officer-overview");
      expect(await approveRegistration(tx, { ...reg, actor: ADMIN })).toMatchObject({ ok: true });
      const noPhone = await registered(tx, "test-officer-overview", {
        noPersonalPhone: true,
        phone: "",
      });
      expect(await approveRegistration(tx, { ...noPhone, actor: ADMIN })).toMatchObject({
        ok: true,
      });

      const after = await membershipOverview(tx);
      expect(after.active).toBe(before.active + 2);
      expect(after.joinedThisWeek).toBe(before.joinedThisWeek + 2);
      expect(after.withoutPhone).toBe(before.withoutPhone + 1);
      expect(inJudea(after)).toBe(inJudea(before) + 2);
      // Every active HBC is listed, the largest first.
      const counts = after.byHbc.map((h) => h.active);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    });
  });

  it("reads today's SMS against the cap", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await smsUsageToday(tx);
      expect(before.cap).toBeGreaterThan(0);
      expect(await reserveSms(tx)).toBe(before.sent < before.cap);
      const after = await smsUsageToday(tx);
      expect(after.sent).toBe(Math.min(before.sent + 1, before.cap));
    });
  });
});
