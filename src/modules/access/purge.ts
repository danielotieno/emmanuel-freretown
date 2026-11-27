import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";

/** Rows each table lost. */
export type StaffPurgeResult = {
  sessions: number;
  verifications: number;
  rateLimits: number;
};

/**
 * Deletes Better Auth's rows once they can no longer be used (database-design.md §6,
 * `session.purge`): sessions past their 24-hour expiry, verification values past theirs, and
 * rate-limit counters untouched for a day. Sessions and counters hold staff IP addresses and
 * browsers, so they are not kept beyond use (retention schedule). An idle-timed-out session is
 * deleted when it is next used, or here once it expires.
 */
export async function purgeExpiredStaffRows(db: DbOrTx): Promise<StaffPurgeResult> {
  const deleted = (statement: ReturnType<typeof sql>) =>
    safeQuery(async () => (await db.execute(statement)).rowCount ?? 0);
  return {
    sessions: await deleted(sql`DELETE FROM session WHERE expires_at < now()`),
    verifications: await deleted(sql`DELETE FROM verification WHERE expires_at < now()`),
    // last_request is Better Auth's epoch milliseconds.
    rateLimits: await deleted(
      sql`DELETE FROM staff_rate_limit
           WHERE last_request < (extract(epoch FROM now() - interval '1 day') * 1000)::bigint`,
    ),
  };
}
