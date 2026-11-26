import { and, eq } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx } from "../../db";
import { registration } from "../../db/schema";
import * as audit from "../audit";
import { enqueueSms } from "../notifications";
import { SafeError } from "../observability";
import { checkUnitsForRegistration } from "../organisation";
import { recordInPersonVerification, redeemRegistrationVerification } from "../verification";
import type { ValidAssistedRegistration } from "./fields";
import { conflictFlags, insertFirstRevision, insertRegistration } from "./intake";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface AssistedRegistrationSubmission {
  /**
   * A random uuid the desk draws once per member, kept with the unfinished form. It becomes the
   * registration's id, so submitting the same form twice (a retry after a lost response) stores
   * one registration, not two.
   */
  submissionId: string;
  registration: ValidAssistedRegistration;
  /** The officer capturing it. The caller has checked their Registration Officer role. */
  officer: audit.StaffActor;
  /** The member's language, for their SMS (NFR-5); not necessarily the desk's language. */
  language: "en" | "sw";
  /** For `PHONE_OTP` only: the token from `verifyPhoneChallenge` for the member's phone. */
  verificationToken?: string;
  requestId?: string;
}

export type AssistedRegistrationResult =
  /**
   * Stored as SUBMITTED. Send the SMS with `sendNow` after the response; there is none when the
   * member has no personal phone.
   */
  | {
      ok: true;
      reference: string;
      registrationId: string;
      smsId: string | null;
      /** True when this submission id was already stored: nothing new, and no second SMS. */
      replayed?: boolean;
    }
  /** The code check is missing, spent, expired or for another phone: check again. */
  | { ok: false; reason: "verification" }
  /** The HBC or a department can't be chosen (deactivated since the form loaded). */
  | { ok: false; reason: "units"; hbcUnavailable: boolean; unavailableDepartmentIds: string[] };

class VerificationRefused extends Error {}

/**
 * Stores an assisted registration (FR-3) in one transaction: the registration (SUBMITTED,
 * channel ASSISTED, the capturing officer and the event), its first revision submitted by the
 * officer with the member's declarations and the "no personal phone" mark (BR-06), the declared
 * departments (BR-05), the verification evidence, an audit entry (rule 4) and the confirmation
 * SMS in the outbox (FR-8). Either all of it is stored or none of it.
 *
 * Evidence follows FR-3: with the member's phone at the desk, the officer's code check is spent
 * and recorded as `PHONE_OTP`; without it, or with no personal phone, the officer records
 * `IN_PERSON` and the phone number, if any, stays unverified.
 *
 * FWO and phone conflicts (BR-03, BR-06) are flagged for the administrator, exactly as for
 * self-registration, and the result doesn't mention them: officers see no other member's data.
 * A member with no personal phone gets no SMS.
 */
export async function submitAssistedRegistration(
  db: DbOrTx,
  submission: AssistedRegistrationSubmission,
  otpSecret: string,
): Promise<AssistedRegistrationResult> {
  const {
    submissionId,
    registration: details,
    officer,
    language,
    verificationToken,
    requestId,
  } = submission;
  if (!UUID.test(submissionId)) {
    throw new SafeError("invalid_submission_id", "A desk submission id is a lowercase uuid");
  }
  try {
    return await safeQuery(() =>
      db.transaction(async (tx): Promise<AssistedRegistrationResult> => {
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
          id: submissionId,
          channel: "ASSISTED",
          capturedByUserId: officer.userId,
          eventLabel: details.eventLabel,
          language,
          fwoConflict,
          phoneConflict,
        });
        await insertFirstRevision(tx, registrationId, {
          ...details,
          submittedByUserId: officer.userId,
        });

        if (details.verification === "PHONE_OTP") {
          const verified =
            details.phoneE164 !== null &&
            (await redeemRegistrationVerification(
              tx,
              {
                token: verificationToken ?? "",
                phoneE164: details.phoneE164,
                registrationId,
                actor: officer,
                requestId,
              },
              otpSecret,
            ));
          if (!verified) throw new VerificationRefused();
        } else {
          await recordInPersonVerification(tx, {
            registrationId,
            officer,
            eventLabel: details.eventLabel,
            requestId,
          });
        }

        // The details are in the revision; the audit entry records what happened, the flags
        // and the officer's confirmations (FR-3), not a second copy of the member's details.
        await audit.write(tx, {
          actor: officer,
          action: "registration.submit",
          entityType: "registration",
          entityId: registrationId,
          after: {
            status: "SUBMITTED",
            channel: "ASSISTED",
            revisionNo: 1,
            verification: details.verification,
            isNewMember: details.isNewMember,
            noPersonalPhone: details.noPersonalPhone,
            fwoConflict,
            phoneConflict,
            departments: details.departmentIds.length,
            readBackConfirmed: true,
            consentGivenVerbally: true,
          },
          requestId,
        });

        const smsId =
          details.phoneE164 === null
            ? null
            : await enqueueSms(tx, {
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
    // A concurrent copy of the same submission committed first: answer as it did.
    if (isUniqueViolation(error, "registration_pkey")) {
      const stored = await findAssistedSubmission(db, { submissionId, officer });
      if (stored) {
        return { ok: true, ...stored, registrationId: submissionId, smsId: null, replayed: true };
      }
    }
    throw error;
  }
}

/**
 * The registration an officer already stored under this desk submission id, if any: a retry
 * after a lost response (#18) gets the same reference instead of a second registration. Only the
 * officer who captured it can find it; any other id, or another officer's, finds nothing.
 */
export async function findAssistedSubmission(
  db: DbOrTx,
  lookup: { submissionId: string; officer: audit.StaffActor },
): Promise<{ reference: string } | null> {
  if (!UUID.test(lookup.submissionId)) return null;
  const rows = await safeQuery(() =>
    db
      .select({ reference: registration.reference })
      .from(registration)
      .where(
        and(
          eq(registration.id, lookup.submissionId),
          eq(registration.channel, "ASSISTED"),
          eq(registration.capturedByUserId, lookup.officer.userId),
        ),
      )
      .limit(1),
  );
  return rows[0] ?? null;
}
