import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { membershipOverview } from "../../src/modules/membership";
import { reserveSms, smsUsageToday } from "../../src/modules/notifications";
import {
  approveRegistration,
  checkAssistedRegistration,
  deskOverview,
  OVERVIEW_DAYS,
  registrationOverview,
  requestCorrection,
  submitAssistedRegistration,
} from "../../src/modules/registration";
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
async function registered(tx: Transaction, officer: string) {
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

describe("the staff dashboard's figures", () => {
  it("counts what waits, what was sent back and what was decided, with a 14-day series", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await registrationOverview(tx);
      expect(before.daily).toHaveLength(OVERVIEW_DAYS);

      const first = await registered(tx, "test-officer-overview");
      const second = await registered(tx, "test-officer-overview");
      const third = await registered(tx, "test-officer-overview");
      expect(await requestCorrection(tx, { ...second, reason: "Wrong HBC", actor: ADMIN })).toEqual(
        expect.objectContaining({ ok: true }),
      );
      expect(await approveRegistration(tx, { ...third, actor: ADMIN })).toMatchObject({ ok: true });

      const after = await registrationOverview(tx);
      expect(after.waiting).toBe(before.waiting + 1);
      expect(after.toCorrect).toBe(before.toCorrect + 1);
      expect(after.approvedThisWeek).toBe(before.approvedThisWeek + 1);
      expect(after.rejectedThisWeek).toBe(before.rejectedThisWeek);
      expect(after.oldestWaitingAt).toBeInstanceOf(Date);
      const today = after.daily.at(-1)!;
      expect(today.assisted).toBe(before.daily.at(-1)!.assisted + 3);
      expect(today.self).toBe(before.daily.at(-1)!.self);
      // Oldest first, one row a day.
      expect(after.daily.map((d) => d.day)).toEqual(after.daily.map((d) => d.day).sort());
      expect(first.registrationId).not.toBe(second.registrationId);
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

      const after = await membershipOverview(tx);
      expect(after.active).toBe(before.active + 1);
      expect(after.joinedThisWeek).toBe(before.joinedThisWeek + 1);
      expect(inJudea(after)).toBe(inJudea(before) + 1);
      expect(after.inactive).toBe(before.inactive);
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
