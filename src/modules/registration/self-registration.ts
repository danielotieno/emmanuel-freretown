import { safeQuery, type DbOrTx } from "../../db";
import * as audit from "../audit";
import { enqueueSms } from "../notifications";
import { checkUnitsForRegistration } from "../organisation";
import { redeemRegistrationVerification } from "../verification";
import type { ValidSelfRegistration } from "./fields";
import {
  conflictFlags,
  flagOpenRegistrations,
  insertFirstRevision,
  insertRegistration,
} from "./intake";

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

        const { fwoConflict, phoneConflict } = await conflictFlags(tx, details);
        const { id: registrationId, reference } = await insertRegistration(tx, {
          channel: "SELF",
          language,
          fwoConflict,
          phoneConflict,
        });
        await insertFirstRevision(tx, registrationId, { ...details, submittedByUserId: null });
        // Another open registration with this phone is flagged too, so both show (#158, D28).
        await flagOpenRegistrations(tx, {
          fwoNumbers: [],
          phones: [details.phoneE164],
          exceptRegistrationId: registrationId,
          cause: "shared_phone",
          actor: { type: "PUBLIC" },
          requestId,
        });

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
