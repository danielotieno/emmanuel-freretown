import { eq, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { smsSetting } from "../../db/schema";
import { reportError, SafeError } from "../observability";

export type SmsSettingKey = "daily_cap" | "low_balance_units";

/** Used only if a setting's row is missing; migration 0005 seeds both. */
const DEFAULTS: Record<SmsSettingKey, number> = { daily_cap: 1000, low_balance_units: 1500 };

/** Staff are warned when the day's SMS reach this share of the cap (D25). */
const WARN_AT = 0.8;

export async function getSmsSetting(db: DbOrTx, key: SmsSettingKey): Promise<number> {
  const rows = await safeQuery(() =>
    db.select({ value: smsSetting.value }).from(smsSetting).where(eq(smsSetting.key, key)),
  );
  return rows[0]?.value ?? DEFAULTS[key];
}

/** Today's SMS (Africa/Nairobi day) against the daily cap (D25), for the staff dashboard. */
export async function smsUsageToday(db: DbOrTx): Promise<{ sent: number; cap: number }> {
  const [cap, { rows }] = await Promise.all([
    getSmsSetting(db, "daily_cap"),
    safeQuery(() =>
      db.execute<{ sent: number }>(sql`
        SELECT sent FROM sms_daily_usage
         WHERE day = (now() AT TIME ZONE 'Africa/Nairobi')::date`),
    ),
  ]);
  return { sent: rows[0]?.sent ?? 0, cap };
}

/**
 * Counts one SMS against today's cap (D25: Africa/Nairobi day, every SMS counts, OTP codes
 * included) and says whether it may be sent. At the cap it returns false: OTP sending pauses
 * (the caller shows the public the normal message) and outbox messages wait for the next day.
 *
 * The count goes up only while under the cap, in one statement, so concurrent senders never
 * pass it. Each increment returns a distinct total, so exactly one sender sees the 80% mark
 * and one sees the cap, and staff are alerted once each (to Sentry, D25).
 *
 * The statement locks today's row until its transaction ends. Never call this inside a
 * transaction that then calls the provider: every other SMS would wait for that call.
 */
export async function reserveSms(db: DbOrTx): Promise<boolean> {
  const cap = await getSmsSetting(db, "daily_cap");
  if (cap <= 0) return false;
  const { rows } = await safeQuery(() =>
    db.execute<{ sent: number }>(sql`
      INSERT INTO sms_daily_usage (day, sent)
      VALUES ((now() AT TIME ZONE 'Africa/Nairobi')::date, 1)
      ON CONFLICT (day) DO UPDATE SET sent = sms_daily_usage.sent + 1
       WHERE sms_daily_usage.sent < ${cap}
      RETURNING sent`),
  );
  const sent = rows[0]?.sent;
  if (sent === undefined) return false;

  const tags = { sent: String(sent), cap: String(cap) };
  if (sent === cap) {
    reportError(new SafeError("sms_cap_reached", "Daily SMS cap reached; sending paused"), tags);
  } else if (sent === Math.ceil(cap * WARN_AT)) {
    reportError(new SafeError("sms_cap_warning", "Daily SMS use reached 80% of the cap"), tags);
  }
  return true;
}
