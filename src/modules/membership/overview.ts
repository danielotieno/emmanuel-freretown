import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";

/**
 * The staff dashboard's figures about members: counts only, never a name, a phone number or an
 * FWO number. Callers check the administrator's role first (CLAUDE.md rule 1).
 */
export interface MembershipOverview {
  active: number;
  /** Active members whose record was created in the last seven days. */
  joinedThisWeek: number;
  /** Active members with no personal phone (BR-06): they can't receive an SMS. */
  withoutPhone: number;
  /**
   * Active members in each active HBC, the largest first; an HBC with none is included. A member
   * whose HBC has been deactivated is in `active` but in no row here.
   */
  byHbc: { hbcId: string; name: string; active: number }[];
}

export async function membershipOverview(db: DbOrTx): Promise<MembershipOverview> {
  const [counts, byHbc] = await Promise.all([
    safeQuery(() =>
      db.execute<{
        active: number;
        joined: number;
        without_phone: number;
      }>(sql`
        SELECT count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
               count(*) FILTER (WHERE status = 'ACTIVE'
                                  AND created_at >= now() - interval '7 days')::int AS joined,
               count(*) FILTER (WHERE status = 'ACTIVE' AND phone_e164 IS NULL)::int AS without_phone
          FROM member`),
    ),
    safeQuery(() =>
      db.execute<{ hbc_id: string; name: string; active: number }>(sql`
        SELECT h.id AS hbc_id, h.name, count(m.id)::int AS active
          FROM hbc h
          LEFT JOIN member_hbc_assignment a ON a.hbc_id = h.id AND a.valid_to IS NULL
          LEFT JOIN member m ON m.id = a.member_id AND m.status = 'ACTIVE'
         WHERE h.is_active
         GROUP BY h.id, h.name, h.sort_order
         ORDER BY count(m.id) DESC, h.sort_order, h.name`),
    ),
  ]);
  const c = counts.rows[0];
  return {
    active: c?.active ?? 0,
    joinedThisWeek: c?.joined ?? 0,
    withoutPhone: c?.without_phone ?? 0,
    byHbc: byHbc.rows.map((row) => ({ hbcId: row.hbc_id, name: row.name, active: row.active })),
  };
}
