import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { hmacSha256Hex } from "../../lib/crypto";

export interface RateLimit {
  /** What is limited, e.g. "otp:ip". Part of the stored key; never personal data. */
  scope: string;
  /** Attempts allowed in any window of `windowSeconds`. */
  limit: number;
  windowSeconds: number;
}

/**
 * FR-2: at most 3 codes per phone per hour, and a resend only after 60 seconds. Per IP, 20 an
 * hour: generous, because many phones share one address (mobile carriers, church Wi-Fi), yet
 * enough to stop one script from sending many codes. Turnstile runs before these.
 */
export const OTP_LIMITS = {
  ip: { scope: "otp:ip", limit: 20, windowSeconds: 3600 },
  phoneResend: { scope: "otp:phone:resend", limit: 1, windowSeconds: 60 },
  phoneHourly: { scope: "otp:phone", limit: 3, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimit>;

/**
 * Counts one attempt for `subject` (a phone number or an IP address) if it is under the limit,
 * and says whether it was. The stored key is `<scope>:<HMAC-SHA256 of the subject>` with a
 * server secret, never the subject or a plain hash of it: every Kenyan phone number could be
 * hashed and looked up in minutes (issue #13).
 *
 * The window slides: it counts the attempts in the last `windowSeconds`, exactly. An advisory
 * lock on the key makes check-and-count atomic, so concurrent requests can never get more than
 * `limit` through; a refused attempt is not counted. Runs in its own transaction, or a
 * savepoint inside the caller's.
 */
export async function consumeRateLimit(
  db: DbOrTx,
  limit: RateLimit,
  subject: string,
  secret: string,
): Promise<boolean> {
  const key = `${limit.scope}:${await hmacSha256Hex(secret, subject)}`;
  return safeQuery(() =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      const { rows } = await tx.execute<{ used: number }>(sql`
        SELECT coalesce(sum(count), 0)::int AS used FROM rate_limit_bucket
         WHERE key = ${key}
           AND window_start > clock_timestamp() - make_interval(secs => ${limit.windowSeconds})`);
      if ((rows[0]?.used ?? 0) >= limit.limit) return false;
      await tx.execute(sql`
        INSERT INTO rate_limit_bucket (key, window_start, count)
        VALUES (${key}, clock_timestamp(), 1)
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_bucket.count + 1`);
      return true;
    }),
  );
}

export type OtpSendCheck =
  { allowed: true } | { allowed: false; reason: "ip" | "phone_resend" | "phone_hourly" };

/**
 * The rate limits for sending an OTP (FR-2), checked in order: the IP first, so a client over
 * its limit can't use up a phone's quota, then the 60-second resend, then the hourly limit.
 * Call it after Turnstile has passed and the phone is known to be Kenyan, and before the daily
 * SMS cap. The result concerns the request only, never whether the phone is in the registry.
 */
export async function checkOtpSendLimits(
  db: DbOrTx,
  request: { phoneE164: string; ip: string },
  secret: string,
): Promise<OtpSendCheck> {
  if (!(await consumeRateLimit(db, OTP_LIMITS.ip, request.ip, secret))) {
    return { allowed: false, reason: "ip" };
  }
  if (!(await consumeRateLimit(db, OTP_LIMITS.phoneResend, request.phoneE164, secret))) {
    return { allowed: false, reason: "phone_resend" };
  }
  if (!(await consumeRateLimit(db, OTP_LIMITS.phoneHourly, request.phoneE164, secret))) {
    return { allowed: false, reason: "phone_hourly" };
  }
  return { allowed: true };
}

/**
 * Deletes rate-limit entries older than a day (database-design.md §6, `ratelimit.purge`). The
 * longest window is an hour, so nothing deleted still counts. Returns the rows deleted.
 */
export async function purgeExpiredRateLimits(db: DbOrTx): Promise<number> {
  return safeQuery(async () => {
    const { rowCount } = await db.execute(
      sql`DELETE FROM rate_limit_bucket WHERE window_start < now() - interval '1 day'`,
    );
    return rowCount ?? 0;
  });
}
