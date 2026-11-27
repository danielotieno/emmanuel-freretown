import { and, asc, eq, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  registration,
  registrationRevision,
  registrationRevisionDepartment,
} from "../../db/schema";
import * as audit from "../audit";
import { checkUnitsForRegistration } from "../organisation";
import {
  checkCorrection,
  type CorrectionFieldName,
  type CorrectionFields,
  type FieldError,
} from "./fields";
import { conflictFlags, PRIVACY_NOTICE_VERSION } from "./intake";
import { openRegistrationForReview, type RegistrationForReview } from "./review";

/**
 * Corrections by staff (FR-5, #21). After an administrator asks for a correction (FR-4), the
 * member is told by SMS to contact the church office or visit the desk; a Registration Officer
 * or an administrator then enters the corrected details as a new revision (BR-09), and the
 * registration goes back to the review queue. Callers check for either role first (CLAUDE.md
 * rule 1); these functions enforce everything about the registration itself.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface CorrectionItem {
  id: string;
  reference: string;
  channel: "SELF" | "ASSISTED";
  fullName: string | null;
  /** When the latest correction was asked for. */
  requestedAt: Date;
}

/**
 * The registrations waiting for a correction (CORRECTION_REQUESTED), the longest waiting first.
 * A list, like the review queue: viewing it is not recorded (D31); opening one is.
 */
export async function listCorrections(
  db: DbOrTx,
  limit = 200,
): Promise<{ items: CorrectionItem[]; total: number }> {
  const requestedAt = sql<Date>`(
    SELECT max(d.at) FROM registration_decision d
     WHERE d.registration_id = ${registration.id} AND d.action = 'REQUEST_CORRECTION')`.mapWith(
    (value: string | Date) => (value instanceof Date ? value : new Date(value)),
  );
  const waiting = eq(registration.status, "CORRECTION_REQUESTED");
  const [items, [totals]] = await Promise.all([
    safeQuery(() =>
      db
        .select({
          id: registration.id,
          reference: registration.reference,
          channel: registration.channel,
          fullName: registrationRevision.fullName,
          requestedAt,
        })
        .from(registration)
        .innerJoin(
          registrationRevision,
          and(
            eq(registrationRevision.registrationId, registration.id),
            eq(registrationRevision.revisionNo, registration.currentRevisionNo),
          ),
        )
        .where(waiting)
        .orderBy(asc(requestedAt), asc(registration.id))
        .limit(limit),
    ),
    safeQuery(() =>
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(registration)
        .where(waiting),
    ),
  ]);
  return { items, total: totals?.n ?? 0 };
}

/**
 * Opens a registration for a correction (FR-5). Only one waiting for a correction is opened:
 * Registration Officers may see those, not every registration, so anything else answers
 * `not_waiting` before any personal data is read or the access recorded. A waiting one is
 * opened as for review, recording `registration.view` (BR-12, D31). Null when there is no such
 * registration.
 */
export async function openRegistrationForCorrection(
  db: DbOrTx,
  open: { registrationId: string; actor: audit.StaffActor; requestId?: string },
): Promise<RegistrationForReview | "not_waiting" | null> {
  if (!UUID.test(open.registrationId)) return null;
  const [row] = await safeQuery(() =>
    db
      .select({ status: registration.status })
      .from(registration)
      .where(eq(registration.id, open.registrationId)),
  );
  if (!row) return null;
  if (row.status !== "CORRECTION_REQUESTED") return "not_waiting";
  const reg = await openRegistrationForReview(db, open);
  // Corrected or decided between the two reads: shown as no longer waiting.
  return reg && reg.status !== "CORRECTION_REQUESTED" ? "not_waiting" : reg;
}

/**
 * Why a correction was refused. Each is shown to staff as a plain message.
 * - `not_found`: no such registration.
 * - `stale`: it isn't waiting for a correction any more (someone corrected, withdrew or acted on
 *   it), or it changed since it was opened.
 * - `invalid`: a field is wrong; `errors` says which.
 * - `notice_changed`: the privacy notice changed since the member consented, and the member's
 *   consent to the current one wasn't confirmed (D35).
 * - `hbc_required`: the HBC was left unknown, which only a new member still waiting for their
 *   FWO number may (D49).
 * - `units`: the HBC or a department chosen isn't an active one (BR-04).
 */
export type CorrectionRefusal =
  "not_found" | "stale" | "invalid" | "notice_changed" | "hbc_required" | "units";

export type CorrectionResult =
  | { ok: true }
  | { ok: false; reason: Exclude<CorrectionRefusal, "invalid"> }
  | { ok: false; reason: "invalid"; errors: Partial<Record<CorrectionFieldName, FieldError>> };

class Refused extends Error {
  constructor(readonly reason: Exclude<CorrectionRefusal, "invalid">) {
    super(reason);
  }
}

class Invalid extends Error {
  constructor(readonly errors: Partial<Record<CorrectionFieldName, FieldError>>) {
    super("invalid");
  }
}

/**
 * Enters a correction (FR-5, BR-09) in one transaction: revision n + 1 with the corrected
 * details and its declared departments, submitted by the staff member; the registration back to
 * SUBMITTED on it, with the conflict flags worked out again for the new details (BR-03, BR-06)
 * and the version bumped; and a `registration.correct` audit entry (rule 4) naming which details
 * changed, never their values, which are in the revision (BR-14). No SMS: the member asked to
 * contact the office has done so (FR-8 sends one on submission, correction request and approval).
 *
 * What the form can't change carries over from revision n: whether the member is new, and a new
 * member's FWO number (or none yet), which only the Church Secretary enters (BR-16); the 18+
 * declaration and the consent (BR-07, BR-15).
 *
 * Consent (D35, BR-15): the consent carries over while the privacy notice is the one the member
 * consented to. If it has changed since, the staff member confirms the member consents to the
 * current notice (`consentToCurrentNotice`), and the new revision records the current version;
 * without that the correction is refused.
 *
 * The registration row is locked first, at the version the staff member saw, so a concurrent
 * correction or decision waits and then fails as `stale`.
 */
export async function submitCorrection(
  db: DbOrTx,
  correction: {
    registrationId: string;
    /** The version the staff member saw (`RegistrationForReview.version`). */
    version: number;
    fields: CorrectionFields;
    consentToCurrentNotice?: boolean;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<CorrectionResult> {
  const { registrationId, actor, requestId } = correction;
  if (!UUID.test(registrationId)) return { ok: false, reason: "not_found" };

  try {
    return await safeQuery(() =>
      db.transaction(async (tx): Promise<CorrectionResult> => {
        const reg = await lockForCorrection(tx, registrationId, correction.version);
        const previous = await revisionOf(tx, registrationId, reg.currentRevisionNo);

        const checked = checkCorrection(correction.fields, previous.isNewMember);
        if (!checked.ok) throw new Invalid(checked.errors);
        const details = checked.value;
        // A new member's number is the Secretary's (BR-16): it, or none yet, carries over.
        const fwoNumber = previous.isNewMember ? previous.fwoNumber : details.fwoNumber;
        // D49: only a new member still waiting for their number may have no HBC; the Secretary
        // sets it with the number, and approval needs both.
        if (details.hbcId === null && fwoNumber !== null) throw new Refused("hbc_required");

        const noticeChanged = previous.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION;
        if (noticeChanged && !correction.consentToCurrentNotice) {
          throw new Refused("notice_changed");
        }
        const units = await checkUnitsForRegistration(tx, {
          hbcId: details.hbcId,
          departmentIds: details.departmentIds,
        });
        if (!units.ok) throw new Refused("units");

        const flags = await conflictFlags(
          tx,
          { fwoNumber, phoneE164: details.phoneE164 },
          registrationId,
        );

        const next = reg.currentRevisionNo + 1;
        await tx.insert(registrationRevision).values({
          registrationId,
          revisionNo: next,
          fullName: details.fullName,
          fwoNumber,
          phoneE164: details.phoneE164,
          hbcId: details.hbcId,
          adultDeclared: true,
          transferConsent: true,
          isNewMember: previous.isNewMember,
          noPersonalPhone: details.noPersonalPhone,
          privacyNoticeVersion: noticeChanged
            ? PRIVACY_NOTICE_VERSION
            : previous.privacyNoticeVersion,
          submittedByUserId: actor.userId,
        });
        if (details.departmentIds.length > 0) {
          await tx.insert(registrationRevisionDepartment).values(
            details.departmentIds.map((departmentId) => ({
              registrationId,
              revisionNo: next,
              departmentId,
            })),
          );
        }

        const moved = await tx
          .update(registration)
          .set({
            status: "SUBMITTED",
            currentRevisionNo: next,
            fwoConflict: flags.fwoConflict,
            phoneConflict: flags.phoneConflict,
            version: sql`${registration.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(
            and(eq(registration.id, registrationId), eq(registration.version, correction.version)),
          )
          .returning({ id: registration.id });
        if (moved.length !== 1) throw new Refused("stale");

        await audit.write(tx, {
          actor,
          action: "registration.correct",
          entityType: "registration",
          entityId: registrationId,
          before: { status: "CORRECTION_REQUESTED", revisionNo: reg.currentRevisionNo },
          after: {
            status: "SUBMITTED",
            revisionNo: next,
            changed: changedDetails(previous, { ...details, fwoNumber }),
            fwoConflict: flags.fwoConflict,
            phoneConflict: flags.phoneConflict,
            ...(noticeChanged ? { consentToNotice: PRIVACY_NOTICE_VERSION } : {}),
          },
          requestId,
        });
        return { ok: true };
      }),
    );
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    if (error instanceof Invalid) return { ok: false, reason: "invalid", errors: error.errors };
    throw error;
  }
}

/**
 * Locks the registration and checks it is the one the staff member saw: waiting for a
 * correction, at the same version.
 */
async function lockForCorrection(tx: Transaction, registrationId: string, version: number) {
  const [row] = await tx
    .select({
      status: registration.status,
      version: registration.version,
      currentRevisionNo: registration.currentRevisionNo,
    })
    .from(registration)
    .where(eq(registration.id, registrationId))
    .for("update");
  if (!row) throw new Refused("not_found");
  if (row.status !== "CORRECTION_REQUESTED" || row.version !== version) {
    throw new Refused("stale");
  }
  return row;
}

interface StoredDetails {
  fullName: string | null;
  fwoNumber: string | null;
  phoneE164: string | null;
  noPersonalPhone: boolean;
  hbcId: string | null;
  departmentIds: string[];
}

async function revisionOf(tx: Transaction, registrationId: string, revisionNo: number) {
  const [revision] = await tx
    .select({
      fullName: registrationRevision.fullName,
      fwoNumber: registrationRevision.fwoNumber,
      phoneE164: registrationRevision.phoneE164,
      noPersonalPhone: registrationRevision.noPersonalPhone,
      hbcId: registrationRevision.hbcId,
      isNewMember: registrationRevision.isNewMember,
      privacyNoticeVersion: registrationRevision.privacyNoticeVersion,
    })
    .from(registrationRevision)
    .where(
      and(
        eq(registrationRevision.registrationId, registrationId),
        eq(registrationRevision.revisionNo, revisionNo),
      ),
    );
  // A registration waiting for a correction is open, so never redacted (BR-14).
  if (!revision) throw new Refused("not_found");
  const departments = await tx
    .select({ id: registrationRevisionDepartment.departmentId })
    .from(registrationRevisionDepartment)
    .where(
      and(
        eq(registrationRevisionDepartment.registrationId, registrationId),
        eq(registrationRevisionDepartment.revisionNo, revisionNo),
      ),
    );
  return { ...revision, departmentIds: departments.map((d) => d.id) };
}

/** Which details a correction changed, by name, for the audit entry: never the values. */
function changedDetails(before: StoredDetails, after: StoredDetails): string[] {
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));
  const changed: string[] = [];
  if (before.fullName !== after.fullName) changed.push("fullName");
  if (before.fwoNumber !== after.fwoNumber) changed.push("fwoNumber");
  if (before.phoneE164 !== after.phoneE164 || before.noPersonalPhone !== after.noPersonalPhone) {
    changed.push("phone");
  }
  if (before.hbcId !== after.hbcId) changed.push("hbc");
  if (!sameSet(before.departmentIds, after.departmentIds)) changed.push("departments");
  return changed;
}
