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
 * FR-2: at most 3 codes per phone per hour, and a resend only after 60 seconds. Per IP (an IPv6
 * /64), 20 an hour: generous, because many phones share one address (mobile carriers, church
 * Wi-Fi), yet enough to stop one script from sending many codes. Turnstile runs before these.
 *
 * At the officer desk (FR-3, #18) the per-IP limit gives way to one per officer: an officer
 * registers about 20 people an hour (requirements §12), and several officers may share one
 * church Wi-Fi. 60 an hour leaves room for resends; the per-phone limits still apply. The
 * officer's and the phone's hourly limits also count the confirmation SMS the desk sends to a
 * number no code has checked (`checkDeskSmsLimits`).
 */
export const OTP_LIMITS = {
  ip: { scope: "otp:ip", limit: 20, windowSeconds: 3600 },
  staff: { scope: "otp:staff", limit: 60, windowSeconds: 3600 },
  phoneResend: { scope: "otp:phone:resend", limit: 1, windowSeconds: 60 },
  phoneHourly: { scope: "otp:phone", limit: 3, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimit>;

interface Check {
  limit: RateLimit;
  subject: string;
}

/**
 * Checks several limits as one: either every one is under its limit and each counts one
 * attempt, or nothing is counted. Returns the index of the first limit that refused, or -1.
 *
 * Stored keys are `<scope>:<HMAC-SHA256 of the subject>` with a server secret, never the subject
 * or a plain hash of it: every Kenyan phone number could be hashed and looked up in minutes
 * (issue #13). Windows slide: a check sums the attempts of the last `windowSeconds`, exactly.
 * Transaction-scoped advisory locks on the keys, taken in a fixed order so two requests can't
 * deadlock, make check-and-count atomic: concurrent requests never get more than a limit
 * through. Runs in its own transaction, or a savepoint inside the caller's.
 */
async function consumeAll(db: DbOrTx, checks: Check[], secret: string): Promise<number> {
  const keys = await Promise.all(
    checks.map(async (c) => `${c.limit.scope}:${await hmacSha256Hex(secret, c.subject)}`),
  );
  if (new Set(keys).size !== keys.length) throw new Error("Each limit needs its own scope");
  return safeQuery(() =>
    db.transaction(async (tx) => {
      for (const key of [...keys].sort()) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      }
      const windows = sql.join(
        keys.map(
          (key, i) => sql`(${i}::int, ${key}::text, ${checks[i]!.limit.windowSeconds}::int)`,
        ),
        sql`, `,
      );
      const { rows } = await tx.execute<{ i: number; used: number }>(sql`
        SELECT k.i, (SELECT coalesce(sum(b.count), 0)::int FROM rate_limit_bucket b
                      WHERE b.key = k.key
                        AND b.window_start > clock_timestamp() - make_interval(secs => k.secs)) AS used
          FROM (VALUES ${windows}) AS k(i, key, secs)
         ORDER BY k.i`);
      const refused = rows.findIndex((row) => row.used >= checks[row.i]!.limit.limit);
      if (refused !== -1) return rows[refused]!.i;

      const values = sql.join(
        keys.map((key) => sql`(${key}, clock_timestamp(), 1)`),
        sql`, `,
      );
      await tx.execute(sql`
        INSERT INTO rate_limit_bucket (key, window_start, count) VALUES ${values}
        ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_bucket.count + 1`);
      return -1;
    }),
  );
}

/**
 * Counts one attempt for `subject` (a phone number or an IP address) if it is under the limit,
 * and says whether it was. A refused attempt is not counted. See `consumeAll` for how.
 */
export async function consumeRateLimit(
  db: DbOrTx,
  limit: RateLimit,
  subject: string,
  secret: string,
): Promise<boolean> {
  return (await consumeAll(db, [{ limit, subject }], secret)) === -1;
}

/**
 * What an IP is counted as. IPv4 as is. IPv6 by its /64 prefix: one client normally controls a
 * whole /64 and could otherwise rotate addresses to get a fresh limit each time. An IPv4-mapped
 * IPv6 address counts as its IPv4 address. Anything unparseable is used as given.
 */
export function ipRateLimitSubject(ip: string): string {
  const address = ip.trim().toLowerCase().replace(/%.*$/, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mapped) return mapped[1]!;
  if (!address.includes(":")) return address;
  const halves = address.split("::");
  if (halves.length > 2) return address;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return address;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

export type OtpSendCheck =
  { allowed: true } | { allowed: false; reason: "ip" | "staff" | "phone_resend" | "phone_hourly" };

/**
 * Who is asking for the code: a member on a public page, counted by IP, or an officer at the
 * desk (FR-3), counted by their staff user id.
 */
export type OtpSender = { ip: string } | { staffUserId: string };

/**
 * The rate limits for sending an OTP (FR-2): the sender's hourly limit (per IP on public pages,
 * per officer at the desk), the phone's 60-second resend and the phone's hourly limit, checked
 * and counted together: a request refused by any of them counts against none, so taps that send
 * nothing don't use up a shared IP's quota. The reason names the first limit that refused, in
 * that order. Call it after Turnstile has passed and the phone is known to be Kenyan, and before
 * the daily SMS cap. The result concerns the request only, never whether the phone is in the
 * registry.
 */
export async function checkOtpSendLimits(
  db: DbOrTx,
  request: { phoneE164: string } & OtpSender,
  secret: string,
): Promise<OtpSendCheck> {
  const sender =
    "staffUserId" in request
      ? { reason: "staff" as const, limit: OTP_LIMITS.staff, subject: request.staffUserId }
      : { reason: "ip" as const, limit: OTP_LIMITS.ip, subject: ipRateLimitSubject(request.ip) };
  const refused = await consumeAll(
    db,
    [
      { limit: sender.limit, subject: sender.subject },
      { limit: OTP_LIMITS.phoneResend, subject: request.phoneE164 },
      { limit: OTP_LIMITS.phoneHourly, subject: request.phoneE164 },
    ],
    secret,
  );
  if (refused === -1) return { allowed: true };
  return {
    allowed: false,
    reason: ([sender.reason, "phone_resend", "phone_hourly"] as const)[refused]!,
  };
}

export type DeskSmsCheck = { allowed: true } | { allowed: false; reason: "staff" | "phone_hourly" };

/**
 * Rule 8 for the officer desk's other SMS (FR-3, #18): a registration whose phone wasn't at the
 * desk gets its confirmation SMS at a number no code has checked. Each one counts against the
 * officer's hourly limit and the phone's hourly limit, shared with the codes, so a desk can't
 * send more SMS an hour than it could send codes: no flood of texts to one number, and no drain
 * on the daily cap (D25). Counted together, all or nothing, like `checkOtpSendLimits`.
 */
export async function checkDeskSmsLimits(
  db: DbOrTx,
  request: { phoneE164: string; staffUserId: string },
  secret: string,
): Promise<DeskSmsCheck> {
  const refused = await consumeAll(
    db,
    [
      { limit: OTP_LIMITS.staff, subject: request.staffUserId },
      { limit: OTP_LIMITS.phoneHourly, subject: request.phoneE164 },
    ],
    secret,
  );
  if (refused === -1) return { allowed: true };
  return { allowed: false, reason: refused === 0 ? "staff" : "phone_hourly" };
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
