import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";

export interface RedactionResult {
  redacted: number;
  failed: number;
}

/**
 * Redacts the personal details of every registration rejected or withdrawn more than 12 months
 * ago (BR-14; database-design.md §6, `retention.redact`). `redact_expired_registration` is the
 * authority: it checks eligibility again, redacts the revisions, evidence and audit entries,
 * and writes its own `registration.redact` audit entry in the same statement. The query below
 * mirrors its conditions only so that it is not called for registrations that aren't due.
 *
 * Idempotent: a redacted registration is never selected again. One failure doesn't stop the
 * rest; it is counted in `failed`. Call it outside a transaction: each redaction commits on its
 * own, and inside a transaction one failure would abort the others.
 */
export async function redactExpiredRegistrations(db: DbOrTx): Promise<RedactionResult> {
  const due = await safeQuery(() =>
    db.execute<{ id: string }>(sql`
      SELECT r.id FROM registration r
       WHERE r.status IN ('REJECTED', 'WITHDRAWN')
         AND r.decided_at < now() - interval '12 months'
         AND r.personal_data_redacted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM registration_decision d
            WHERE d.registration_id = r.id
              AND d.action IN ('REJECT', 'WITHDRAW')
              AND d.at < now() - interval '12 months')
       ORDER BY r.decided_at`),
  );

  const result: RedactionResult = { redacted: 0, failed: 0 };
  for (const { id } of due.rows) {
    try {
      await safeQuery(() => db.execute(sql`SELECT public.redact_expired_registration(${id})`));
      result.redacted += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
