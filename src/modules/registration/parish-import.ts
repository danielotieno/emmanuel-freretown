import { safeQuery, type DbOrTx } from "../../db";
import type * as audit from "../audit";
import { importMembers, type ImportResult } from "../membership";
import { flagOpenRegistrations, PRIVACY_NOTICE_VERSION } from "./intake";

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
          cause: "member_import",
          actor: request.actor,
          requestId: request.requestId,
        });
      }
      return result;
    }),
  );
}
