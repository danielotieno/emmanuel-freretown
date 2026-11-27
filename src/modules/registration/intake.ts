import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  registration,
  registrationRevision,
  registrationRevisionDepartment,
} from "../../db/schema";
import { fwoBelongsToMember, phoneBelongsToMember } from "../membership";
import { SafeError } from "../observability";
import { generateReference } from "./reference";

/**
 * What self-registration (FR-1) and assisted registration (FR-3) share: the conflict flags, the
 * registration row with its reference, and the first revision with its departments. Each runs
 * inside the caller's transaction.
 */

/**
 * The privacy notice the member acknowledges, recorded with every revision (BR-15). Raise it
 * whenever the notice at /privacy changes (#27).
 */
export const PRIVACY_NOTICE_VERSION = "2026-11-30";

/**
 * BR-03 and BR-06: whether the FWO is held by a member or another open registration, and whether
 * the phone is held by a member. The caller stores the flags and never shows them to the public.
 */
export async function conflictFlags(
  tx: Transaction,
  details: { fwoNumber: string | null; phoneE164: string | null },
): Promise<{ fwoConflict: boolean; phoneConflict: boolean }> {
  // Both FWO checks always run: skipping the second when the first matches would make the
  // answer measurably faster exactly when the FWO is a member's (rule 3).
  let fwoConflict = false;
  if (details.fwoNumber !== null) {
    const heldByMember = await fwoBelongsToMember(tx, details.fwoNumber);
    const inOpenRegistration = await fwoInOpenRegistration(tx, details.fwoNumber);
    fwoConflict = heldByMember || inOpenRegistration;
  }
  const phoneConflict =
    details.phoneE164 !== null && (await phoneBelongsToMember(tx, details.phoneE164));
  return { fwoConflict, phoneConflict };
}

/** BR-03: another registration still open for review with this FWO on its current revision. */
async function fwoInOpenRegistration(tx: Transaction, fwoNumber: string): Promise<boolean> {
  return (await openRegistrationsWithFwo(tx, fwoNumber)).length > 0;
}

/**
 * BR-03 at review (FR-4): the references of other registrations still open (SUBMITTED or
 * CORRECTION_REQUESTED) whose current revision has this FWO, oldest first, leaving out
 * `exceptRegistrationId`. Staff screens only: an FWO collision blocks approval until the
 * administrator rejects the duplicate (D33).
 */
export async function openRegistrationsWithFwo(
  db: DbOrTx,
  fwoNumber: string,
  exceptRegistrationId?: string,
): Promise<string[]> {
  const rows = await safeQuery(() =>
    db
      .select({ reference: registration.reference })
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
          exceptRegistrationId ? ne(registration.id, exceptRegistrationId) : undefined,
        ),
      )
      .orderBy(asc(registration.createdAt))
      .limit(10),
  );
  return rows.map((r) => r.reference);
}

export type NewRegistration =
  { channel: "SELF" } | { channel: "ASSISTED"; capturedByUserId: string; eventLabel: string };

/**
 * Inserts the registration (SUBMITTED) with a new random reference, drawing another if it is
 * taken. Each try runs in a savepoint, so a collision doesn't abort the surrounding transaction.
 * With `id`, the registration gets that id (the officer desk's submission id, which makes a
 * repeated submission fail on `registration_pkey`); otherwise the database draws one.
 */
export async function insertRegistration(
  tx: Transaction,
  values: NewRegistration & {
    id?: string;
    language: "en" | "sw";
    fwoConflict: boolean;
    phoneConflict: boolean;
  },
): Promise<{ id: string; reference: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateReference();
    try {
      const [row] = await safeQuery(() =>
        tx.transaction((savepoint) =>
          savepoint
            .insert(registration)
            .values({ reference, ...values })
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

/**
 * Revision 1 with the member's declarations (BR-07, BR-15) and the current privacy-notice
 * version, and its declared departments (BR-05).
 */
export async function insertFirstRevision(
  tx: Transaction,
  registrationId: string,
  details: {
    fullName: string;
    fwoNumber: string | null;
    phoneE164: string | null;
    /** Null: a new member's HBC, to be set by the Church Secretary (D49). */
    hbcId: string | null;
    departmentIds: string[];
    isNewMember: boolean;
    /** BR-06: recorded by an officer only. */
    noPersonalPhone?: boolean;
    /** The officer, for an assisted registration; null when the member submitted it. */
    submittedByUserId: string | null;
  },
): Promise<void> {
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
    noPersonalPhone: details.noPersonalPhone ?? false,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    submittedByUserId: details.submittedByUserId,
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
}
