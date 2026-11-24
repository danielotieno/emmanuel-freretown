import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { phoneChallenge } from "../../db/schema";

/**
 * Deletes OTP challenges created more than 24 hours ago (database-design.md §6, `otp.purge`).
 * A challenge expires after 5 minutes (FR-2), so nothing deleted here can still be used.
 * Idempotent; uses the database clock. Returns the number of rows deleted.
 */
export async function purgeExpiredChallenges(db: DbOrTx): Promise<number> {
  return safeQuery(async () => {
    const deleted = await db
      .delete(phoneChallenge)
      .where(sql`${phoneChallenge.createdAt} < now() - interval '24 hours'`)
      .returning({ id: phoneChallenge.id });
    return deleted.length;
  });
}
