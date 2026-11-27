import { and, eq, inArray, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import { registration, registrationRevision } from "../../db/schema";
import * as audit from "../audit";
import { importMembers, type ImportResult } from "../membership";
import { PRIVACY_NOTICE_VERSION } from "./intake";

/**
 * The import of the parish list (FR-13, D47) as the staff action runs it: `importMembers`
 * (membership module) and, in the same transaction, the conflict flags on registrations still
 * open for review whose FWO number or phone the import has just made a member's. Their flags
 * were set at submission (BR-03, BR-06); without this the review queue's conflict filters would
 * miss them, although approval would still refuse (it checks again).
 */
export async function importParishList(
  db: DbOrTx,
  request: {
    text: string;
    digest: string;
    expectedCount: number;
    consentConfirmedOn: string;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<ImportResult> {
  return safeQuery(() =>
    db.transaction(async (tx) => {
      const result = await importMembers(tx, {
        ...request,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      });
      if (result.ok) {
        await flagOpenRegistrations(tx, {
          fwoNumbers: result.fwoNumbers,
          phones: result.phones,
          actor: request.actor,
          requestId: request.requestId,
        });
      }
      return result;
    }),
  );
}

/**
 * Sets `fwo_conflict` / `phone_conflict` on every SUBMITTED or CORRECTION_REQUESTED registration
 * whose current revision has one of these FWO numbers or phones and isn't flagged yet, bumping
 * its version so a reviewer with it open sees the change. Each one gets a
 * `registration.flag_conflict` audit entry (rule 4) naming which flags were set.
 */
async function flagOpenRegistrations(
  tx: Transaction,
  held: { fwoNumbers: string[]; phones: string[]; actor: audit.StaffActor; requestId?: string },
): Promise<void> {
  const open = inArray(registration.status, ["SUBMITTED", "CORRECTION_REQUESTED"]);
  const current = and(
    eq(registrationRevision.registrationId, registration.id),
    eq(registrationRevision.revisionNo, registration.currentRevisionNo),
  );
  const flagged = new Map<string, { fwoConflict?: true; phoneConflict?: true }>();

  if (held.fwoNumbers.length > 0) {
    const rows = await safeQuery(() =>
      tx
        .update(registration)
        .set({ fwoConflict: true, version: sql`${registration.version} + 1` })
        .from(registrationRevision)
        .where(
          and(
            current,
            open,
            eq(registration.fwoConflict, false),
            inArray(registrationRevision.fwoNumber, held.fwoNumbers),
          ),
        )
        .returning({ id: registration.id }),
    );
    for (const { id } of rows) flagged.set(id, { fwoConflict: true });
  }
  if (held.phones.length > 0) {
    const rows = await safeQuery(() =>
      tx
        .update(registration)
        .set({ phoneConflict: true, version: sql`${registration.version} + 1` })
        .from(registrationRevision)
        .where(
          and(
            current,
            open,
            eq(registration.phoneConflict, false),
            inArray(registrationRevision.phoneE164, held.phones),
          ),
        )
        .returning({ id: registration.id }),
    );
    for (const { id } of rows) flagged.set(id, { ...flagged.get(id), phoneConflict: true });
  }

  await audit.writeMany(
    tx,
    [...flagged].map(([id, after]) => ({
      actor: held.actor,
      action: "registration.flag_conflict" as const,
      entityType: "registration" as const,
      entityId: id,
      after: { ...after, cause: "member_import" },
      requestId: held.requestId,
    })),
  );
}
