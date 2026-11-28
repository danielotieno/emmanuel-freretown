import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";

/**
 * The staff dashboard's figures about registrations: counts and a daily series, never a name,
 * a phone number or an FWO number. Callers check the role first (CLAUDE.md rule 1): the
 * overview is for administrators, the desk figures for the officer they belong to.
 */

/** How many days the dashboard's chart covers, today included. */
export const OVERVIEW_DAYS = 14;

export interface RegistrationOverview {
  /** Waiting for a decision (SUBMITTED). */
  waiting: number;
  /** When the registration waiting longest was received; null if none is waiting. */
  oldestWaitingAt: Date | null;
  /** Of those waiting: flagged for a shared FWO number, a shared phone, or a new member. */
  fwoConflicts: number;
  phoneConflicts: number;
  newMembers: number;
  /** Sent back for a correction (CORRECTION_REQUESTED). */
  toCorrect: number;
  /** Decided in the last seven days (rolling, not the calendar week). */
  approvedThisWeek: number;
  rejectedThisWeek: number;
  /** Registrations received on each of the last 14 Africa/Nairobi days, oldest first. */
  daily: { day: string; self: number; assisted: number }[];
}

export async function registrationOverview(db: DbOrTx): Promise<RegistrationOverview> {
  const [counts, daily] = await Promise.all([
    safeQuery(() =>
      db.execute<{
        waiting: number;
        oldest: Date | string | null;
        fwo_conflicts: number;
        phone_conflicts: number;
        new_members: number;
        to_correct: number;
        approved: number;
        rejected: number;
      }>(sql`
        SELECT count(*) FILTER (WHERE r.status = 'SUBMITTED')::int AS waiting,
               min(r.created_at) FILTER (WHERE r.status = 'SUBMITTED') AS oldest,
               count(*) FILTER (WHERE r.status = 'SUBMITTED' AND r.fwo_conflict)::int AS fwo_conflicts,
               count(*) FILTER (WHERE r.status = 'SUBMITTED' AND r.phone_conflict)::int AS phone_conflicts,
               count(*) FILTER (WHERE r.status = 'SUBMITTED' AND v.is_new_member)::int AS new_members,
               count(*) FILTER (WHERE r.status = 'CORRECTION_REQUESTED')::int AS to_correct,
               count(*) FILTER (WHERE r.status = 'APPROVED'
                                  AND r.decided_at >= now() - interval '7 days')::int AS approved,
               count(*) FILTER (WHERE r.status = 'REJECTED'
                                  AND r.decided_at >= now() - interval '7 days')::int AS rejected
          FROM registration r
          JOIN registration_revision v
            ON v.registration_id = r.id AND v.revision_no = r.current_revision_no`),
    ),
    safeQuery(() =>
      db.execute<{ day: string; self: number; assisted: number }>(sql`
        SELECT d.day::text AS day,
               count(r.id) FILTER (WHERE r.channel = 'SELF')::int AS self,
               count(r.id) FILTER (WHERE r.channel = 'ASSISTED')::int AS assisted
          FROM (SELECT generate_series(t.today - ${OVERVIEW_DAYS - 1}::int, t.today, interval '1 day')::date AS day
                  FROM (SELECT (now() AT TIME ZONE 'Africa/Nairobi')::date AS today) t) d
          LEFT JOIN registration r
            ON (r.created_at AT TIME ZONE 'Africa/Nairobi')::date = d.day
         GROUP BY d.day
         ORDER BY d.day`),
    ),
  ]);
  const c = counts.rows[0];
  return {
    waiting: c?.waiting ?? 0,
    oldestWaitingAt: c?.oldest ? new Date(c.oldest) : null,
    fwoConflicts: c?.fwo_conflicts ?? 0,
    phoneConflicts: c?.phone_conflicts ?? 0,
    newMembers: c?.new_members ?? 0,
    toCorrect: c?.to_correct ?? 0,
    approvedThisWeek: c?.approved ?? 0,
    rejectedThisWeek: c?.rejected ?? 0,
    daily: daily.rows.map((row) => ({ day: row.day, self: row.self, assisted: row.assisted })),
  };
}

export interface DeskOverview {
  /** Registrations this officer took at the desk today (Africa/Nairobi) and in the last 7 days. */
  capturedToday: number;
  capturedThisWeek: number;
}

/** The officer's own desk figures: what `userId` captured. */
export async function deskOverview(db: DbOrTx, userId: string): Promise<DeskOverview> {
  const { rows } = await safeQuery(() =>
    db.execute<{ today: number; week: number }>(sql`
      SELECT count(*) FILTER (WHERE (r.created_at AT TIME ZONE 'Africa/Nairobi')::date
                                  = (now() AT TIME ZONE 'Africa/Nairobi')::date)::int AS today,
             count(*)::int AS week
        FROM registration r
       WHERE r.captured_by_user_id = ${userId}
         AND r.created_at >= now() - interval '7 days'`),
  );
  return { capturedToday: rows[0]?.today ?? 0, capturedThisWeek: rows[0]?.week ?? 0 };
}
