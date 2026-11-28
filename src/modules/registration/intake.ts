import { and, asc, eq, inArray, ne, sql, type AnyColumn } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  registration,
  registrationRevision,
  registrationRevisionDepartment,
} from "../../db/schema";
import * as audit from "../audit";
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
 * the phone is held by an active or inactive member or another open registration (#158: two
 * people giving one phone are both called, D28). The caller stores the flags and never shows
 * them to the public.
 */
export async function conflictFlags(
  tx: Transaction,
  details: { fwoNumber: string | null; phoneE164: string | null },
  /** A correction's own registration (FR-5), which is open and must not conflict with itself. */
  exceptRegistrationId?: string,
): Promise<{ fwoConflict: boolean; phoneConflict: boolean }> {
  // Both checks of each pair always run: skipping the second when the first matches would make
  // the answer measurably faster exactly when the number is known (rule 3).
  let fwoConflict = false;
  if (details.fwoNumber !== null) {
    const heldByMember = await fwoBelongsToMember(tx, details.fwoNumber);
    const inOpenRegistration =
      (await openRegistrationsWithFwo(tx, details.fwoNumber, exceptRegistrationId)).length > 0;
    fwoConflict = heldByMember || inOpenRegistration;
  }
  let phoneConflict = false;
  if (details.phoneE164 !== null) {
    const heldByMember = await phoneBelongsToMember(tx, details.phoneE164);
    const inOpenRegistration =
      (await openRegistrationsWithPhone(tx, details.phoneE164, exceptRegistrationId)).length > 0;
    phoneConflict = heldByMember || inOpenRegistration;
  }
  return { fwoConflict, phoneConflict };
}

/** Registrations still open for review: SUBMITTED or CORRECTION_REQUESTED. */
const OPEN = inArray(registration.status, ["SUBMITTED", "CORRECTION_REQUESTED"]);
/** A registration joined to its current revision. */
const CURRENT = and(
  eq(registrationRevision.registrationId, registration.id),
  eq(registrationRevision.revisionNo, registration.currentRevisionNo),
);

/**
 * BR-03 at review (FR-4): the references of other registrations still open whose current
 * revision has this FWO, oldest first, leaving out `exceptRegistrationId`. Staff screens only:
 * an FWO collision blocks approval until the administrator rejects the duplicate (D33).
 */
export function openRegistrationsWithFwo(
  db: DbOrTx,
  fwoNumber: string,
  exceptRegistrationId?: string,
): Promise<string[]> {
  return openRegistrationsWith(db, registrationRevision.fwoNumber, fwoNumber, exceptRegistrationId);
}

/**
 * BR-06 at review (FR-4, #158): the references of other registrations still open whose current
 * revision has this phone, oldest first, leaving out `exceptRegistrationId`. Staff screens only:
 * the administrator calls both people to agree who keeps it (D28).
 */
export function openRegistrationsWithPhone(
  db: DbOrTx,
  phoneE164: string,
  exceptRegistrationId?: string,
): Promise<string[]> {
  return openRegistrationsWith(db, registrationRevision.phoneE164, phoneE164, exceptRegistrationId);
}

async function openRegistrationsWith(
  db: DbOrTx,
  column: AnyColumn,
  value: string,
  exceptRegistrationId: string | undefined,
): Promise<string[]> {
  const rows = await safeQuery(() =>
    db
      .select({ reference: registration.reference })
      .from(registration)
      .innerJoin(registrationRevision, CURRENT)
      .where(
        and(
          eq(column, value),
          OPEN,
          exceptRegistrationId ? ne(registration.id, exceptRegistrationId) : undefined,
        ),
      )
      .orderBy(asc(registration.createdAt))
      .limit(10),
  );
  return rows.map((r) => r.reference);
}

/**
 * Sets `fwo_conflict` / `phone_conflict` on every open registration whose current revision has
 * one of these FWO numbers or phones and isn't flagged yet, leaving out `exceptRegistrationId`,
 * and bumps its version so a reviewer with it open sees the change. Each one gets a
 * `registration.flag_conflict` audit entry (rule 4) naming the flags set and why. Used when the
 * parish import makes them members' (D47) and when another registration arrives with the same
 * FWO number or phone (`flagOthersSharing`), so the review queue's conflict filters find both of
 * a pair.
 *
 * Each UPDATE runs whether or not anything matches, so a public submission takes the same
 * statements either way (rule 3); only the audit entries of a match are extra.
 */
export async function flagOpenRegistrations(
  tx: Transaction,
  held: {
    fwoNumbers: string[];
    phones: string[];
    exceptRegistrationId?: string;
    cause: "member_import" | "another_registration";
    actor: audit.Actor;
    requestId?: string;
  },
): Promise<void> {
  const notThis = held.exceptRegistrationId
    ? ne(registration.id, held.exceptRegistrationId)
    : undefined;
  const flagged = new Map<string, { fwoConflict?: true; phoneConflict?: true }>();

  if (held.fwoNumbers.length > 0) {
    const rows = await safeQuery(() =>
      tx
        .update(registration)
        .set({ fwoConflict: true, version: sql`${registration.version} + 1` })
        .from(registrationRevision)
        .where(
          and(
            CURRENT,
            OPEN,
            notThis,
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
            CURRENT,
            OPEN,
            notThis,
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
      after: { ...after, cause: held.cause },
      requestId: held.requestId,
    })),
  );
}

/**
 * BR-03 and BR-06 for the other side of a pair (#158, #163): after a registration is stored or
 * corrected, every other open registration with its FWO number or phone is flagged too, so the
 * review queue's conflict filters find both and the administrator compares them (D33) or calls
 * both people (D28). A new member with no FWO number yet, or no personal phone, flags nothing
 * for it.
 */
export function flagOthersSharing(
  tx: Transaction,
  stored: {
    registrationId: string;
    fwoNumber: string | null;
    phoneE164: string | null;
    actor: audit.Actor;
    requestId?: string;
  },
): Promise<void> {
  return flagOpenRegistrations(tx, {
    fwoNumbers: stored.fwoNumber === null ? [] : [stored.fwoNumber],
    phones: stored.phoneE164 === null ? [] : [stored.phoneE164],
    exceptRegistrationId: stored.registrationId,
    cause: "another_registration",
    actor: stored.actor,
    requestId: stored.requestId,
  });
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
