import { and, eq, inArray } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  registration,
  registrationRevision,
  registrationRevisionDepartment,
} from "../../db/schema";
import * as audit from "../audit";
import { fwoBelongsToMember, phoneBelongsToMember } from "../membership";
import { enqueueSms } from "../notifications";
import { SafeError } from "../observability";
import { checkUnitsForRegistration } from "../organisation";
import { redeemRegistrationVerification } from "../verification";
import type { ValidSelfRegistration } from "./fields";
import { generateReference } from "./reference";

/**
 * The privacy notice the member acknowledges, recorded with every revision (BR-15). Raise it
 * whenever the notice at /privacy changes (#27).
 */
export const PRIVACY_NOTICE_VERSION = "2026-11-26";

export interface SelfRegistrationSubmission {
  registration: ValidSelfRegistration;
  language: "en" | "sw";
  /** The token from `verifyPhoneChallenge` for this phone (FR-2, #15). */
  verificationToken: string;
  requestId?: string;
}

export type SelfRegistrationResult =
  /** Stored as SUBMITTED. Send the SMS with `sendNow` after the response. */
  | { ok: true; reference: string; registrationId: string; smsId: string }
  /** The phone verification is missing, spent, expired or for another phone: verify again. */
  | { ok: false; reason: "verification" }
  /** The HBC or a department can't be chosen (deactivated since the form loaded). */
  | { ok: false; reason: "units"; hbcUnavailable: boolean; unavailableDepartmentIds: string[] };

class VerificationRefused extends Error {}

/**
 * Stores a self-registration (FR-1) in one transaction: the registration (SUBMITTED, channel
 * SELF, a new reference), its first revision with the member's declarations, the declared
 * departments (BR-05), the spent phone verification with its `PHONE_OTP` evidence (#15), an
 * audit entry (rule 4) and the confirmation SMS in the outbox (FR-8). Either all of it is
 * stored or none of it.
 *
 * An FWO already held by a member or by another open registration (BR-03), or a phone already
 * held by a member (BR-06), is accepted and flagged for the administrator. The result is the
 * same either way: the public never learns that an FWO or phone is in use (rule 3).
 */
export async function submitSelfRegistration(
  db: DbOrTx,
  submission: SelfRegistrationSubmission,
  otpSecret: string,
): Promise<SelfRegistrationResult> {
  const { registration: details, language, verificationToken, requestId } = submission;
  try {
    return await safeQuery(() =>
      db.transaction(async (tx): Promise<SelfRegistrationResult> => {
        const units = await checkUnitsForRegistration(tx, {
          hbcId: details.hbcId,
          departmentIds: details.departmentIds,
        });
        if (!units.ok) {
          return {
            ok: false,
            reason: "units",
            hbcUnavailable: units.hbcUnavailable,
            unavailableDepartmentIds: units.unavailableDepartmentIds,
          };
        }

        // Both FWO checks always run: skipping the second when the first matches would make the
        // answer measurably faster exactly when the FWO is a member's (rule 3).
        let fwoConflict = false;
        if (details.fwoNumber !== null) {
          const heldByMember = await fwoBelongsToMember(tx, details.fwoNumber);
          const inOpenRegistration = await fwoInOpenRegistration(tx, details.fwoNumber);
          fwoConflict = heldByMember || inOpenRegistration;
        }
        const phoneConflict = await phoneBelongsToMember(tx, details.phoneE164);

        const { id: registrationId, reference } = await insertRegistration(tx, {
          language,
          fwoConflict,
          phoneConflict,
        });
        await tx.insert(registrationRevision).values({
          registrationId,
          revisionNo: 1,
          fullName: details.fullName,
          fwoNumber: details.fwoNumber,
          phoneE164: details.phoneE164,
          hbcId: details.hbcId,
          adultDeclared: true,
          transferConsent: true,
          isNewMember: details.isNewMember,
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        });
        if (details.departmentIds.length > 0) {
          await tx.insert(registrationRevisionDepartment).values(
            details.departmentIds.map((departmentId) => ({
              registrationId,
              revisionNo: 1,
              departmentId,
            })),
          );
        }

        const verified = await redeemRegistrationVerification(
          tx,
          {
            token: verificationToken,
            phoneE164: details.phoneE164,
            registrationId,
            actor: { type: "PUBLIC" },
            requestId,
          },
          otpSecret,
        );
        if (!verified) throw new VerificationRefused();

        // The details are in the revision; the audit entry records what happened and the
        // flags, not a second copy of the member's personal data.
        await audit.write(tx, {
          actor: { type: "PUBLIC" },
          action: "registration.submit",
          entityType: "registration",
          entityId: registrationId,
          after: {
            status: "SUBMITTED",
            channel: "SELF",
            revisionNo: 1,
            isNewMember: details.isNewMember,
            fwoConflict,
            phoneConflict,
            departments: details.departmentIds.length,
          },
          requestId,
        });

        const smsId = await enqueueSms(tx, {
          phoneE164: details.phoneE164,
          template: details.isNewMember
            ? "registration.submitted_new_member"
            : "registration.submitted",
          language,
          params: { reference },
        });
        return { ok: true, reference, registrationId, smsId };
      }),
    );
  } catch (error) {
    if (error instanceof VerificationRefused) return { ok: false, reason: "verification" };
    throw error;
  }
}

/** BR-03: another registration still open for review with this FWO on its current revision. */
async function fwoInOpenRegistration(tx: Transaction, fwoNumber: string): Promise<boolean> {
  const rows = await tx
    .select({ id: registration.id })
    .from(registration)
    .innerJoin(
      registrationRevision,
      and(
        eq(registrationRevision.registrationId, registration.id),
        eq(registrationRevision.revisionNo, registration.currentRevisionNo),
      ),
    )
    .where(
      and(
        eq(registrationRevision.fwoNumber, fwoNumber),
        inArray(registration.status, ["SUBMITTED", "CORRECTION_REQUESTED"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Inserts the registration with a new random reference, drawing another if it is taken. Each
 * try runs in a savepoint, so a collision doesn't abort the surrounding transaction.
 */
async function insertRegistration(
  tx: Transaction,
  values: { language: "en" | "sw"; fwoConflict: boolean; phoneConflict: boolean },
): Promise<{ id: string; reference: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();
    try {
      const [row] = await safeQuery(() =>
        tx.transaction((savepoint) =>
          savepoint
            .insert(registration)
            .values({ reference, channel: "SELF", ...values })
            .returning({ id: registration.id }),
        ),
      );
      return { id: row!.id, reference };
    } catch (error) {
      if (!isUniqueViolation(error, "registration_reference_uq")) throw error;
    }
  }
  throw new SafeError("reference_exhausted", "Could not draw an unused registration reference");
}
