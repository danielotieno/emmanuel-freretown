import { sql, type SQL } from "drizzle-orm";
import { safeQuery, SafeDatabaseError, type DbOrTx } from "../../db";

export interface RedactionResult {
  redacted: number;
  failed: number;
  /** The SQLSTATE of the first failure, to diagnose it without any personal data. */
  firstFailure?: string;
}

/**
 * Redacts the personal details of every registration rejected or withdrawn more than 12 months
 * ago (BR-14; database-design.md §6, `retention.redact`). `redact_expired_registration` is the
 * authority: it checks eligibility again, redacts the revisions, evidence and audit entries,
 * and writes its own `registration.redact` audit entry in the same statement. The query below
 * mirrors its conditions only so that it is not called for registrations that aren't due.
 */
export async function redactExpiredRegistrations(db: DbOrTx): Promise<RedactionResult> {
  return redactEach(
    db,
    sql`
      SELECT r.id FROM registration r
       WHERE r.status IN ('REJECTED', 'WITHDRAWN')
         AND r.decided_at < now() - interval '12 months'
         AND r.personal_data_redacted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM registration_decision d
            WHERE d.registration_id = r.id
              AND d.action IN ('REJECT', 'WITHDRAW')
              AND d.at < now() - interval '12 months')
       ORDER BY r.decided_at`,
    (id) => sql`SELECT public.redact_expired_registration(${id})`,
  );
}

/**
 * Removes the name, phone number and department memberships of every member marked deceased or
 * transferred out more than a year ago (D45; database-design.md §6, `retention.redact_members`),
 * from the member record and from every revision and audit entry about them, keeping the FWO
 * number (D2, BR-02), status, dates, HBC history and reasons. `redact_closed_member` is the
 * authority, as `redact_expired_registration` is for registrations: it checks eligibility again
 * from the audit entry that closed the record, and writes its own `member.redact` entry.
 */
export async function redactClosedMembers(db: DbOrTx): Promise<RedactionResult> {
  return redactEach(
    db,
    sql`
      SELECT m.id FROM member m
       WHERE m.status IN ('DECEASED', 'TRANSFERRED_OUT')
         AND m.personal_data_redacted_at IS NULL
         AND (SELECT a.after ->> 'status' = m.status AND a.at < now() - interval '1 year'
                FROM audit_entry a
               WHERE a.entity_type = 'member'
                 AND a.entity_id = m.id::text
                 AND a.action = 'member.change_status'
               ORDER BY a.id DESC
               LIMIT 1)
       ORDER BY m.updated_at`,
    (id) => sql`SELECT public.redact_closed_member(${id})`,
  );
}

/**
 * Calls a redaction function for each id the query finds. Idempotent: a redacted record is
 * never selected again. One failure doesn't stop the rest; it is counted in `failed`. Call it
 * outside a transaction: each redaction commits on its own, and inside a transaction one failure
 * would abort the others.
 */
async function redactEach(
  db: DbOrTx,
  due: SQL,
  redact: (id: string) => SQL,
): Promise<RedactionResult> {
  const { rows } = await safeQuery(() => db.execute<{ id: string }>(due));
  const result: RedactionResult = { redacted: 0, failed: 0 };
  for (const { id } of rows) {
    try {
      await safeQuery(() => db.execute(redact(id)));
      result.redacted += 1;
    } catch (error) {
      result.failed += 1;
      result.firstFailure ??=
        (error instanceof SafeDatabaseError ? error.sqlState : undefined) ?? "unknown";
    }
  }
  return result;
}
