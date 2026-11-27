import { and, desc, eq, isNull } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { hbc, registration, registrationRevision } from "../../db/schema";
import { findActiveMemberForStatusCheck } from "../membership";
import { redeemStatusCheckVerification } from "../verification";
import { REFERENCE_PATTERN } from "./reference";

/**
 * The membership status check (FR-7, BR-13, D24, D48). The member verifies their phone by code,
 * then gives their FWO number or registration reference. Only a record that matches both the
 * verified phone and that number is shown, and every other case gets the one same answer, so
 * the page never reveals whether an FWO number, reference or phone is known (rule 3).
 */

/** What the member typed to identify their record: an FWO number or a reference (D24). */
export type StatusKey = { kind: "fwo"; value: string } | { kind: "reference"; value: string };

/**
 * Reads the FWO number or reference as typed. An FWO is digits only and kept exactly as typed,
 * leading zeros included (BR-01, D29); a reference is matched without regard to case or spaces
 * around it. Anything else is null, and the form asks again before a code is sent.
 */
export function parseStatusKey(input: string): StatusKey | null {
  const value = input.trim();
  if (/^[0-9]+$/.test(value)) return { kind: "fwo", value };
  const reference = value.toUpperCase();
  return REFERENCE_PATTERN.test(reference) ? { kind: "reference", value: reference } : null;
}

/**
 * The answers FR-7 allows. RECEIVED and REGISTERED_MEMBER carry the name and HBC on record
 * (D14, D48); CONTACT_OFFICE and NOT_FOUND carry nothing. `verification` means the code's token
 * was not valid for this phone (expired, already used): nothing was looked up.
 */
export type StatusCheckResult =
  | { ok: true; status: "RECEIVED" | "REGISTERED_MEMBER"; fullName: string; hbcName: string }
  | { ok: true; status: "CONTACT_OFFICE" | "NOT_FOUND" }
  | { ok: false; reason: "verification" };

const NOT_FOUND = { ok: true, status: "NOT_FOUND" } as const;

/**
 * Spends the status-check token for the verified phone and, only if that succeeds, finds the
 * record, in one transaction (`redeemStatusCheckVerification`): one code, one answer, so each
 * guess at another number costs a new code and its rate limits.
 *
 * 1. An ACTIVE member with this phone and FWO number, approved or imported (D47): REGISTERED_MEMBER.
 * 2. Otherwise the newest registration whose current revision has this phone and this FWO number
 *    or reference. Given a reference, the member check of step 1 runs first with that
 *    registration's FWO number, so a member always sees their member record, whichever number
 *    they give (FR-7: when a member and a registration both match, the member is shown; for
 *    example an imported member whose duplicate registration is pending or was rejected).
 *    Then:
 *    - SUBMITTED: RECEIVED, with the name and HBC from that revision;
 *    - CORRECTION_REQUESTED, REJECTED or WITHDRAWN: CONTACT_OFFICE (WITHDRAWN is a staff
 *      decision the member should hear about from the office, like a rejection);
 *    - APPROVED: the member it created, if still ACTIVE with this phone: REGISTERED_MEMBER.
 * 3. Anything else, including an inactive, deceased or transferred member: NOT_FOUND.
 *
 * A redacted registration (BR-14) has no phone left, so it never matches.
 */
export async function checkRegistrationStatus(
  db: DbOrTx,
  request: { phoneE164: string; key: StatusKey; verificationToken: string },
  otpSecret: string,
): Promise<StatusCheckResult> {
  const { phoneE164, key, verificationToken } = request;
  return safeQuery(() =>
    db.transaction(async (tx): Promise<StatusCheckResult> => {
      const redeemed = await redeemStatusCheckVerification(
        tx,
        { token: verificationToken, phoneE164 },
        otpSecret,
      );
      if (!redeemed) return { ok: false, reason: "verification" };

      if (key.kind === "fwo") {
        const found = await findActiveMemberForStatusCheck(tx, { phoneE164, fwoNumber: key.value });
        if (found) return { ok: true, status: "REGISTERED_MEMBER", ...found };
      }

      const [latest] = await safeQuery(() =>
        tx
          .select({
            status: registration.status,
            memberId: registration.memberId,
            fwoNumber: registrationRevision.fwoNumber,
            fullName: registrationRevision.fullName,
            hbcName: hbc.name,
          })
          .from(registration)
          .innerJoin(
            registrationRevision,
            and(
              eq(registrationRevision.registrationId, registration.id),
              eq(registrationRevision.revisionNo, registration.currentRevisionNo),
            ),
          )
          // A revision that isn't redacted always has an HBC (registration_revision_complete_check).
          .innerJoin(hbc, eq(hbc.id, registrationRevision.hbcId))
          .where(
            and(
              eq(registrationRevision.phoneE164, phoneE164),
              isNull(registration.personalDataRedactedAt),
              key.kind === "fwo"
                ? eq(registrationRevision.fwoNumber, key.value)
                : eq(registration.reference, key.value),
            ),
          )
          .orderBy(desc(registration.createdAt))
          .limit(1),
      );
      if (!latest) return NOT_FOUND;

      if (key.kind === "reference" && latest.fwoNumber) {
        const found = await findActiveMemberForStatusCheck(tx, {
          phoneE164,
          fwoNumber: latest.fwoNumber,
        });
        if (found) return { ok: true, status: "REGISTERED_MEMBER", ...found };
      }

      switch (latest.status) {
        case "SUBMITTED":
          // Never null here (the revision isn't redacted); the check only narrows the type.
          if (!latest.fullName) return NOT_FOUND;
          return {
            ok: true,
            status: "RECEIVED",
            fullName: latest.fullName,
            hbcName: latest.hbcName,
          };
        case "CORRECTION_REQUESTED":
        case "REJECTED":
        case "WITHDRAWN":
          return { ok: true, status: "CONTACT_OFFICE" };
        case "APPROVED": {
          if (!latest.memberId) return NOT_FOUND;
          const found = await findActiveMemberForStatusCheck(tx, {
            phoneE164,
            memberId: latest.memberId,
          });
          return found ? { ok: true, status: "REGISTERED_MEMBER", ...found } : NOT_FOUND;
        }
      }
    }),
  );
}
