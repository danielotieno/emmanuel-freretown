import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Transaction } from "../../src/db";
import { hmacSha256Hex } from "../../src/lib/crypto";
import {
  dispatchSms,
  enqueueSms,
  MAX_SMS_ATTEMPTS,
  purgeOldSms,
  recordDeliveryReport,
  reserveSms,
  sendNow,
  sendOtpSms,
  sweepPendingSms,
  checkSmsBalance,
  type SendResult,
  type SmsMessage,
  type SmsProvider,
  type SmsTemplate,
} from "../../src/modules/notifications";
import { registerErrorReporter, SafeError } from "../../src/modules/observability";
import { connectTestDrizzle, rolledBack } from "./db";
import { testDatabaseUrl } from "./env";

// SMS cap, outbox and delivery reports (issues #13, #14; D25, FR-8) against real Postgres,
// as app_runtime. The provider is a fake: no SMS leaves the test.

const db = connectTestDrizzle();

const PHONE = "+254700000021";
const WEBHOOK_SECRET = "whsec_test";

let reports: { code: string; tags: Record<string, string> }[] = [];
beforeEach(() => {
  reports = [];
  registerErrorReporter((error, tags) =>
    reports.push({ code: error instanceof SafeError ? error.code : "other", tags }),
  );
});
afterEach(() => registerErrorReporter(undefined));

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

/** Sets the daily cap and today's count, as the owner. */
async function capState(tx: Transaction, cap: number, sentToday: number) {
  await tx.execute(sql`RESET ROLE`);
  await tx.execute(sql`UPDATE sms_setting SET value = ${cap} WHERE key = 'daily_cap'`);
  await tx.execute(sql`
    INSERT INTO sms_daily_usage (day, sent)
    VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, ${sentToday})
    ON CONFLICT (day) DO UPDATE SET sent = EXCLUDED.sent`);
  await asApp(tx);
}

function fakeProvider(...results: SendResult[]) {
  const sent: SmsMessage[] = [];
  const provider: SmsProvider = {
    async send(message) {
      sent.push(message);
      return results.shift() ?? { outcome: "accepted", messageId: `m-${sent.length}` };
    },
    async balance() {
      return 1000;
    },
  };
  return { provider, sent };
}

async function outboxRow(tx: Transaction, id: string) {
  const { rows } = await tx.execute<{
    status: string;
    attempts: number;
    provider_message_id: string | null;
    last_error: string | null;
    sent_at: Date | null;
    delivered_at: Date | null;
  }>(sql`SELECT status, attempts, provider_message_id, last_error, sent_at, delivered_at
           FROM sms_outbox WHERE id = ${id}`);
  return rows[0]!;
}

async function enqueue(tx: Transaction, template: SmsTemplate = "registration.submitted") {
  return enqueueSms(tx, {
    phoneE164: PHONE,
    template,
    language: "sw",
    params: { reference: "REG-7K3M9" },
  });
}

describe("reserveSms: the daily cap (D25)", () => {
  it("counts every SMS until the cap, then refuses; alerts once at 80% and once at the cap", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 10, 6);
      const results = [];
      for (let i = 0; i < 6; i++) results.push(await reserveSms(tx));
      expect(results).toEqual([true, true, true, true, false, false]);
      expect(reports.map((r) => r.code)).toEqual(["sms_cap_warning", "sms_cap_reached"]);
      expect(reports[0]!.tags).toEqual({ sent: "8", cap: "10" });
    });
  });

  it("counts by Africa/Nairobi day", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await reserveSms(tx);
      const { rows } = await tx.execute<{ today: boolean }>(sql`
        SELECT day = (now() AT TIME ZONE 'Africa/Nairobi')::date AS today
          FROM sms_daily_usage ORDER BY day DESC LIMIT 1`);
      expect(rows[0]!.today).toBe(true);
    });
  });

  it("refuses everything when the cap is 0", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 0, 0);
      expect(await reserveSms(tx)).toBe(false);
    });
  });

  it("never lets concurrent senders past the cap", async () => {
    // Separate connections and commits; restores the setting and today's count afterwards.
    const pool = createDb(testDatabaseUrl());
    const today = sql`(now() AT TIME ZONE 'Africa/Nairobi')::date`;
    const before = await pool.db.execute<{ cap: number; sent: number | null }>(sql`
      SELECT (SELECT value FROM sms_setting WHERE key = 'daily_cap') AS cap,
             (SELECT sent FROM sms_daily_usage WHERE day = ${today}) AS sent`);
    const { cap, sent } = before.rows[0]!;
    try {
      await pool.db.execute(
        sql`UPDATE sms_setting SET value = ${(sent ?? 0) + 3} WHERE key = 'daily_cap'`,
      );
      const results = await Promise.all(Array.from({ length: 10 }, () => reserveSms(pool.db)));
      expect(results.filter(Boolean)).toHaveLength(3);
    } finally {
      await pool.db.execute(sql`UPDATE sms_setting SET value = ${cap} WHERE key = 'daily_cap'`);
      if (sent === null)
        await pool.db.execute(sql`DELETE FROM sms_daily_usage WHERE day = ${today}`);
      else
        await pool.db.execute(sql`UPDATE sms_daily_usage SET sent = ${sent} WHERE day = ${today}`);
      await pool.close();
    }
  });
});

describe("enqueueSms (FR-8)", () => {
  it("refuses non-Kenyan numbers and any parameter beyond the reference", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const base = { template: "registration.approved", language: "en" } as const;
      await expect(
        enqueueSms(tx, { ...base, phoneE164: "+255712345678", params: { reference: "REG-7K3M9" } }),
      ).rejects.toMatchObject({ code: "invalid_sms_phone" });
      await expect(
        enqueueSms(tx, {
          ...base,
          phoneE164: PHONE,
          params: { reference: "REG-7K3M9", fullName: "Test Person" },
        }),
      ).rejects.toMatchObject({ code: "invalid_sms_params" });
    });
  });
});

describe("dispatchSms (issue #14)", () => {
  it("sends in the member's language with the outbox id as tracking id, and marks it SENT", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      const { provider, sent } = fakeProvider();
      expect(await dispatchSms(tx, id, provider)).toBe("sent");
      expect(sent).toEqual([
        {
          to: PHONE,
          trackingId: id,
          text: expect.stringContaining("tumepokea usajili wako") as unknown as string,
        },
      ]);
      expect(sent[0]!.text).toContain("REG-7K3M9");
      expect(await outboxRow(tx, id)).toMatchObject({
        status: "SENT",
        attempts: 1,
        provider_message_id: "m-1",
        last_error: null,
      });
      // Sent once; dispatching again does nothing.
      expect(await dispatchSms(tx, id, provider)).toBe("skipped");
      expect(sent).toHaveLength(1);
    });
  });

  it("treats a duplicate (0409) as sent: an earlier attempt got through", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      expect(await dispatchSms(tx, id, fakeProvider({ outcome: "duplicate" }).provider)).toBe(
        "sent",
      );
      expect(await outboxRow(tx, id)).toMatchObject({ status: "SENT", last_error: "0409" });
    });
  });

  it("marks a rejected message FAILED at once", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      const { provider } = fakeProvider({ outcome: "rejected", code: "0422" });
      expect(await dispatchSms(tx, id, provider)).toBe("failed");
      expect(await outboxRow(tx, id)).toMatchObject({ status: "FAILED", last_error: "0422" });
    });
  });

  it("retries a temporary failure and marks the message FAILED after five attempts", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      const retry = { outcome: "retry", code: "http_502", accountProblem: false } as const;
      const { provider } = fakeProvider(...Array.from({ length: MAX_SMS_ATTEMPTS }, () => retry));
      const outcomes = [];
      for (let i = 0; i < MAX_SMS_ATTEMPTS; i++) outcomes.push(await dispatchSms(tx, id, provider));
      expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"]);
      expect(await outboxRow(tx, id)).toMatchObject({ status: "FAILED", attempts: 5 });
    });
  });

  it("alerts staff when the provider account needs attention", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      const { provider } = fakeProvider({ outcome: "retry", code: "0402", accountProblem: true });
      expect(await dispatchSms(tx, id, provider)).toBe("retry");
      expect(reports).toEqual([{ code: "sms_account_problem", tags: { code: "0402" } }]);
    });
  });

  it("counts against the cap once, and waits in the outbox when the cap is reached", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 5, 5);
      const id = await enqueue(tx);
      const { provider, sent } = fakeProvider();
      expect(await dispatchSms(tx, id, provider)).toBe("paused");
      expect(sent).toHaveLength(0);
      expect(await outboxRow(tx, id)).toMatchObject({ status: "PENDING", attempts: 0 });

      // A retry (attempts > 0) doesn't count again, even at the cap.
      await capState(tx, 6, 5);
      const retry = { outcome: "retry", code: "timeout", accountProblem: false } as const;
      expect(await dispatchSms(tx, id, fakeProvider(retry).provider)).toBe("retry");
      expect(await dispatchSms(tx, id, provider)).toBe("sent");
      const { rows } = await tx.execute<{ sent: number }>(sql`
        SELECT sent FROM sms_daily_usage WHERE day = (now() AT TIME ZONE 'Africa/Nairobi')::date`);
      expect(rows[0]!.sent).toBe(6);
    });
  });
});

describe("sendOtpSms (FR-2, D25)", () => {
  const otp = {
    phoneE164: PHONE,
    code: "482913",
    language: "en",
    trackingId: "0b6c3f9e-4d1a-4c2b-9f7e-2a5d8e1c3b40",
  } as const;

  it("sends directly, never through the outbox, and counts against the cap", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 10, 0);
      const { provider, sent } = fakeProvider();
      expect(await sendOtpSms(tx, provider, otp)).toBe("sent");
      expect(sent[0]!.text).toContain("482913");
      const { rows } = await tx.execute<{ outbox: number; sent: number }>(sql`
        SELECT (SELECT count(*)::int FROM sms_outbox WHERE params::text LIKE '%482913%') AS outbox,
               (SELECT sent FROM sms_daily_usage
                 WHERE day = (now() AT TIME ZONE 'Africa/Nairobi')::date) AS sent`);
      expect(rows[0]).toEqual({ outbox: 0, sent: 1 });
    });
  });

  it("pauses at the cap without sending", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 10, 10);
      const { provider, sent } = fakeProvider();
      expect(await sendOtpSms(tx, provider, otp)).toBe("paused");
      expect(sent).toHaveLength(0);
    });
  });

  it("refuses a non-Kenyan number before counting or sending", async () => {
    await rolledBack(db, async (tx) => {
      await capState(tx, 10, 0);
      const { provider, sent } = fakeProvider();
      await expect(
        sendOtpSms(tx, provider, { ...otp, phoneE164: "+447700900123" }),
      ).rejects.toMatchObject({ code: "invalid_sms_phone" });
      expect(sent).toHaveLength(0);
    });
  });
});

describe("sendNow", () => {
  it("queues a retry in 30 seconds after a temporary failure, and nothing after a send", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const queued: unknown[] = [];
      const jobs = { send: async (...args: unknown[]) => void queued.push(args) };
      const retry = { outcome: "retry", code: "timeout", accountProblem: false } as const;

      const failing = await enqueue(tx);
      expect(await sendNow(tx, failing, { provider: fakeProvider(retry).provider, jobs })).toBe(
        "retry",
      );
      expect(queued).toEqual([[{ type: "sms.dispatch", id: failing }, { delaySeconds: 30 }]]);

      const ok = await enqueue(tx, "registration.approved");
      expect(await sendNow(tx, ok, { provider: fakeProvider().provider, jobs })).toBe("sent");
      expect(queued).toHaveLength(1);
    });
  });
});

describe("recordDeliveryReport (FR-8: delivery status is recorded)", () => {
  async function signed(body: object) {
    const rawBody = JSON.stringify(body);
    const t = Math.floor(Date.now() / 1000);
    return {
      rawBody,
      signature: `t=${t},v1=${await hmacSha256Hex(WEBHOOK_SECRET, `${t}.${rawBody}`)}`,
    };
  }

  it("marks a sent message DELIVERED, by tracking id or by provider message id", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const a = await enqueue(tx);
      const b = await enqueue(tx, "registration.approved");
      const { provider } = fakeProvider();
      await dispatchSms(tx, a, provider);
      await dispatchSms(tx, b, provider);

      const byTracking = await signed({
        status: "Delivered",
        trackingId: a,
        msisdn: "254700000021",
      });
      expect(await recordDeliveryReport(tx, byTracking, WEBHOOK_SECRET)).toBe("updated");
      const byReference = await signed({ status: "Delivered", reference: "m-2", trackingId: "" });
      expect(await recordDeliveryReport(tx, byReference, WEBHOOK_SECRET)).toBe("updated");

      for (const id of [a, b]) {
        const row = await outboxRow(tx, id);
        expect(row.status).toBe("DELIVERED");
        expect(row.delivered_at).not.toBeNull();
      }
      // At least once: a repeat changes nothing, and a late failure can't undo a delivery.
      expect(await recordDeliveryReport(tx, byTracking, WEBHOOK_SECRET)).toBe("ignored");
      const late = await signed({ status: "Failed", trackingId: a });
      expect(await recordDeliveryReport(tx, late, WEBHOOK_SECRET)).toBe("ignored");
      expect((await outboxRow(tx, a)).status).toBe("DELIVERED");
    });
  });

  it("marks a final failure FAILED with its status, and ignores the interim Sent", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      await dispatchSms(tx, id, fakeProvider().provider);
      expect(
        await recordDeliveryReport(
          tx,
          await signed({ status: "Sent", trackingId: id }),
          WEBHOOK_SECRET,
        ),
      ).toBe("ignored");
      expect(
        await recordDeliveryReport(
          tx,
          await signed({ status: "Unreachable", trackingId: id }),
          WEBHOOK_SECRET,
        ),
      ).toBe("updated");
      expect(await outboxRow(tx, id)).toMatchObject({
        status: "FAILED",
        last_error: "Unreachable",
      });
    });
  });

  it("changes nothing for a forged or malformed report", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await enqueue(tx);
      await dispatchSms(tx, id, fakeProvider().provider);
      const report = await signed({ status: "Delivered", trackingId: id });
      expect(await recordDeliveryReport(tx, report, "wrong-secret")).toBe("unauthorized");
      expect(await recordDeliveryReport(tx, { ...report, signature: null }, WEBHOOK_SECRET)).toBe(
        "unauthorized",
      );
      const garbage = await signed({ nothing: true });
      expect(await recordDeliveryReport(tx, garbage, WEBHOOK_SECRET)).toBe("malformed");
      expect((await outboxRow(tx, id)).status).toBe("SENT");
    });
  });
});

describe("daily SMS jobs (database-design.md §6)", () => {
  it("sms.sweep queues PENDING messages older than 15 minutes; sms.purge deletes those over 90 days", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const fresh = await enqueue(tx);
      const stale = await enqueue(tx);
      const ancient = await enqueue(tx);
      await tx.execute(sql`RESET ROLE`);
      await tx.execute(
        sql`UPDATE sms_outbox SET created_at = now() - interval '20 minutes' WHERE id = ${stale}`,
      );
      await tx.execute(
        sql`UPDATE sms_outbox SET created_at = now() - interval '91 days', status = 'SENT' WHERE id = ${ancient}`,
      );
      await asApp(tx);

      const queued: { type: string; id: string }[] = [];
      const swept = await sweepPendingSms(tx, { send: async (m) => void queued.push(m) });
      expect(queued.filter((m) => [fresh, stale, ancient].includes(m.id))).toEqual([
        { type: "sms.dispatch", id: stale },
      ]);
      expect(swept).toBeGreaterThanOrEqual(1);

      expect(await purgeOldSms(tx)).toBeGreaterThanOrEqual(1);
      const { rows } = await tx.execute<{ id: string }>(
        sql`SELECT id FROM sms_outbox WHERE id IN (${fresh}, ${stale}, ${ancient})`,
      );
      expect(rows.map((r) => r.id).sort()).toEqual([fresh, stale].sort());
    });
  });

  it("sms.balance alerts staff below the low-balance setting only", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const at = (units: number): SmsProvider => ({
        send: async () => ({ outcome: "duplicate" }),
        balance: async () => units,
      });
      expect(await checkSmsBalance(tx, at(5000))).toEqual({ units: 5000, threshold: 1500, low: 0 });
      expect(reports).toEqual([]);
      expect(await checkSmsBalance(tx, at(900))).toEqual({ units: 900, threshold: 1500, low: 1 });
      expect(reports).toEqual([
        { code: "sms_low_balance", tags: { units: "900", threshold: "1500" } },
      ]);
    });
  });
});
