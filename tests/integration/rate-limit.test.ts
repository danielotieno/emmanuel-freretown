import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Transaction } from "../../src/db";
import { hmacSha256Hex } from "../../src/lib/crypto";
import {
  checkOtpSendLimits,
  consumeRateLimit,
  OTP_LIMITS,
  purgeExpiredRateLimits,
} from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";
import { testDatabaseUrl } from "./env";

// Rate limits (issue #13, rule 8, FR-2) against real Postgres, as app_runtime.

const db = connectTestDrizzle();
const SECRET = "test-rate-limit-secret-0123456789abcdef";

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

const limit = (scope: string, max: number, windowSeconds = 3600) => ({
  scope,
  limit: max,
  windowSeconds,
});

describe("consumeRateLimit", () => {
  it("allows exactly the limit, then refuses without counting the refusal", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const l = limit("test:exact", 3);
      const results = [];
      for (let i = 0; i < 5; i++)
        results.push(await consumeRateLimit(tx, l, "+254700000001", SECRET));
      expect(results).toEqual([true, true, true, false, false]);

      const { rows } = await tx.execute<{ total: number }>(
        sql`SELECT sum(count)::int AS total FROM rate_limit_bucket WHERE key LIKE 'test:exact:%'`,
      );
      expect(rows[0]!.total).toBe(3);
      // Another subject has its own count.
      expect(await consumeRateLimit(tx, l, "+254700000002", SECRET)).toBe(true);
    });
  });

  it("stores only scope and HMAC, never the phone number or IP", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await consumeRateLimit(tx, limit("test:keys", 5), "+254700000001", SECRET);
      await consumeRateLimit(tx, limit("test:keys", 5), "198.51.100.7", SECRET);
      const { rows } = await tx.execute<{ key: string }>(
        sql`SELECT key FROM rate_limit_bucket WHERE key LIKE 'test:keys:%'`,
      );
      expect(rows).toHaveLength(2);
      for (const { key } of rows) {
        expect(key).toMatch(/^test:keys:[0-9a-f]{64}$/);
        expect(key).not.toMatch(/254700000001|198\.51/);
      }
    });
  });

  it("slides: attempts older than the window stop counting", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const l = limit("test:slide", 1, 60);
      expect(await consumeRateLimit(tx, l, "+254700000001", SECRET)).toBe(true);
      expect(await consumeRateLimit(tx, l, "+254700000001", SECRET)).toBe(false);
      await tx.execute(sql`RESET ROLE`);
      await tx.execute(sql`
        UPDATE rate_limit_bucket SET window_start = window_start - interval '61 seconds'
         WHERE key LIKE 'test:slide:%'`);
      await asApp(tx);
      expect(await consumeRateLimit(tx, l, "+254700000001", SECRET)).toBe(true);
    });
  });

  it("lets exactly the limit through under concurrent requests", async () => {
    // Real concurrency needs separate connections and commits, so this test cleans up after
    // itself instead of rolling back. Its scope is unique to the run.
    const scope = `test:concurrent:${randomUUID()}`;
    const pool = createDb(testDatabaseUrl());
    try {
      const l = limit(scope, 3);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => consumeRateLimit(pool.db, l, "+254700000001", SECRET)),
      );
      expect(results.filter(Boolean)).toHaveLength(3);
    } finally {
      await pool.db.execute(sql`DELETE FROM rate_limit_bucket WHERE key LIKE ${`${scope}:%`}`);
      await pool.close();
    }
  });
});

describe("checkOtpSendLimits (FR-2)", () => {
  it("allows one send per phone per minute and three per hour", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const send = (ip = "198.51.100.1") =>
        checkOtpSendLimits(tx, { phoneE164: "+254700000003", ip }, SECRET);

      expect(await send()).toEqual({ allowed: true });
      expect(await send()).toEqual({ allowed: false, reason: "phone_resend" });

      // A minute later (moved back in time), a resend is allowed, up to three in the hour.
      const ago = async () => {
        await tx.execute(sql`RESET ROLE`);
        await tx.execute(sql`
          UPDATE rate_limit_bucket SET window_start = window_start - interval '61 seconds'
           WHERE key LIKE 'otp:phone:resend:%'`);
        await asApp(tx);
      };
      await ago();
      expect(await send()).toEqual({ allowed: true });
      await ago();
      expect(await send()).toEqual({ allowed: true });
      await ago();
      expect(await send()).toEqual({ allowed: false, reason: "phone_hourly" });
    });
  });

  it("limits an IP to 20 an hour without using up the phones' quotas", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const ip = "198.51.100.9";
      for (let i = 0; i < OTP_LIMITS.ip.limit; i++) {
        const phone = `+2547000001${String(i).padStart(2, "0")}`;
        expect(await checkOtpSendLimits(tx, { phoneE164: phone, ip }, SECRET)).toEqual({
          allowed: true,
        });
      }
      expect(await checkOtpSendLimits(tx, { phoneE164: "+254700000199", ip }, SECRET)).toEqual({
        allowed: false,
        reason: "ip",
      });
      // The refused phone was not counted: from another IP it can still get a code.
      expect(
        await checkOtpSendLimits(tx, { phoneE164: "+254700000199", ip: "198.51.100.10" }, SECRET),
      ).toEqual({ allowed: true });
    });
  }, 180_000); // ~60 limit checks; slow only against a remote test database
});

describe("checkOtpSendLimits at the officer desk (FR-3, #18)", () => {
  it("counts the officer, not the IP: 60 an hour, and the phone's limits still apply", async () => {
    await rolledBack(db, async (tx) => {
      const ip = "198.51.100.40"; // one church Wi-Fi for two officers
      const officerKey = `otp:staff:${await hmacSha256Hex(SECRET, "officer-a")}`;
      // 59 codes already sent by officer A this hour.
      await tx.execute(sql`
        INSERT INTO rate_limit_bucket (key, window_start, count)
        VALUES (${officerKey}, clock_timestamp() - interval '10 minutes', ${OTP_LIMITS.staff.limit - 1})`);
      await asApp(tx);
      const send = (staffUserId: string, phoneE164: string) =>
        checkOtpSendLimits(tx, { phoneE164, staffUserId }, SECRET);

      expect(await send("officer-a", "+254700000401")).toEqual({ allowed: true });
      expect(await send("officer-a", "+254700000402")).toEqual({
        allowed: false,
        reason: "staff",
      });
      // Officer B on the same network is not held up by officer A.
      expect(await send("officer-b", "+254700000402")).toEqual({ allowed: true });
      expect(await send("officer-b", "+254700000402")).toEqual({
        allowed: false,
        reason: "phone_resend",
      });

      // The desk never counts against the IP that public visitors share.
      const ipKey = `otp:ip:${await hmacSha256Hex(SECRET, ip)}`;
      const { rows } = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM rate_limit_bucket WHERE key = ${ipKey}`,
      );
      expect(rows[0]!.n).toBe(0);
    });
  });
});

describe("checkOtpSendLimits counts a request all or nothing (issue #60 review)", () => {
  it("doesn't count a refused request against the IP", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const ip = "198.51.100.30";
      const send = () => checkOtpSendLimits(tx, { phoneE164: "+254700000031", ip }, SECRET);
      expect(await send()).toEqual({ allowed: true });
      expect(await send()).toEqual({ allowed: false, reason: "phone_resend" });
      expect(await send()).toEqual({ allowed: false, reason: "phone_resend" });

      const ipKey = `otp:ip:${await hmacSha256Hex(SECRET, ip)}`;
      const hourlyKey = `otp:phone:${await hmacSha256Hex(SECRET, "+254700000031")}`;
      const { rows } = await tx.execute<{ key: string; total: number }>(sql`
        SELECT key, sum(count)::int AS total FROM rate_limit_bucket
         WHERE key IN (${ipKey}, ${hourlyKey}) GROUP BY key`);
      expect(Object.fromEntries(rows.map((r) => [r.key, r.total]))).toEqual({
        [ipKey]: 1,
        [hourlyKey]: 1,
      });
    });
  });

  it("counts IPv6 addresses in one /64 together", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      for (let i = 0; i < OTP_LIMITS.ip.limit; i++) {
        const ip = `2001:db8:1:2:${(i + 1).toString(16)}::1`;
        const phone = `+2547000002${String(i).padStart(2, "0")}`;
        expect(await checkOtpSendLimits(tx, { phoneE164: phone, ip }, SECRET)).toEqual({
          allowed: true,
        });
      }
      expect(
        await checkOtpSendLimits(
          tx,
          { phoneE164: "+254700000299", ip: "2001:db8:1:2:ffff::9" },
          SECRET,
        ),
      ).toEqual({ allowed: false, reason: "ip" });
    });
  }, 180_000);
});

describe("ratelimit.purge", () => {
  it("deletes entries older than a day and keeps newer ones", async () => {
    await rolledBack(db, async (tx) => {
      await tx.execute(sql`
        INSERT INTO rate_limit_bucket (key, window_start, count) VALUES
          ('test:purge:old', now() - interval '25 hours', 1),
          ('test:purge:new', now() - interval '23 hours', 1)`);
      await asApp(tx);
      expect(await purgeExpiredRateLimits(tx)).toBeGreaterThanOrEqual(1);
      const { rows } = await tx.execute<{ key: string }>(
        sql`SELECT key FROM rate_limit_bucket WHERE key LIKE 'test:purge:%'`,
      );
      expect(rows).toEqual([{ key: "test:purge:new" }]);
    });
  });
});
