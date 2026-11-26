import { and, asc, count, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  registration,
  registrationDecision,
  registrationRevision,
  registrationRevisionDepartment,
  verificationEvidence,
} from "../../db/schema";
import * as audit from "../audit";
import { createMember, fwoBelongsToMember, phoneBelongsToMember } from "../membership";
import { enqueueSms } from "../notifications";
import { SafeError } from "../observability";
import { checkUnitsForRegistration } from "../organisation";
import { checkReason } from "./fields";
import { openRegistrationsWithFwo } from "./intake";

/**
 * The review queue and the administrator's decisions (FR-4): approve, reject, request a
 * correction. Callers check the Membership Administrator role first (CLAUDE.md rule 1); these
 * functions enforce everything about the registration itself.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const QUEUE_FLAGS = ["FWO_CONFLICT", "PHONE_CONFLICT", "NEW_MEMBER"] as const;
export type QueueFlag = (typeof QUEUE_FLAGS)[number];

export interface QueueFilters {
  hbcId?: string;
  channel?: "SELF" | "ASSISTED";
  flag?: QueueFlag;
  eventLabel?: string;
}

export interface QueueItem {
  id: string;
  reference: string;
  channel: "SELF" | "ASSISTED";
  submittedAt: Date;
  fullName: string | null;
  hbcId: string | null;
  eventLabel: string | null;
  isNewMember: boolean;
  noPersonalPhone: boolean;
  fwoConflict: boolean;
  phoneConflict: boolean;
}

const currentRevision = and(
  eq(registrationRevision.registrationId, registration.id),
  eq(registrationRevision.revisionNo, registration.currentRevisionNo),
);

/** The registrations waiting for review (SUBMITTED), oldest first, as FR-4 filters them. */
export async function listReviewQueue(
  db: DbOrTx,
  filters: QueueFilters = {},
  limit = 200,
): Promise<{ items: QueueItem[]; total: number }> {
  // An HBC filter that isn't an id matches nothing (and never reaches a uuid column as text).
  if (filters.hbcId !== undefined && !UUID.test(filters.hbcId)) return { items: [], total: 0 };
  const where: (SQL | undefined)[] = [eq(registration.status, "SUBMITTED")];
  if (filters.hbcId) where.push(eq(registrationRevision.hbcId, filters.hbcId));
  if (filters.channel) where.push(eq(registration.channel, filters.channel));
  if (filters.eventLabel) where.push(eq(registration.eventLabel, filters.eventLabel));
  if (filters.flag === "FWO_CONFLICT") where.push(eq(registration.fwoConflict, true));
  if (filters.flag === "PHONE_CONFLICT") where.push(eq(registration.phoneConflict, true));
  if (filters.flag === "NEW_MEMBER") where.push(eq(registrationRevision.isNewMember, true));
  const condition = and(...where);

  const [items, [totals]] = await Promise.all([
    safeQuery(() =>
      db
        .select({
          id: registration.id,
          reference: registration.reference,
          channel: registration.channel,
          submittedAt: registration.createdAt,
          fullName: registrationRevision.fullName,
          hbcId: registrationRevision.hbcId,
          eventLabel: registration.eventLabel,
          isNewMember: registrationRevision.isNewMember,
          noPersonalPhone: registrationRevision.noPersonalPhone,
          fwoConflict: registration.fwoConflict,
          phoneConflict: registration.phoneConflict,
        })
        .from(registration)
        .innerJoin(registrationRevision, currentRevision)
        .where(condition)
        .orderBy(asc(registration.createdAt), asc(registration.id))
        .limit(limit),
    ),
    safeQuery(() =>
      db
        .select({ n: count() })
        .from(registration)
        .innerJoin(registrationRevision, currentRevision)
        .where(condition),
    ),
  ]);
  return { items, total: totals?.n ?? 0 };
}

/** The events of registrations waiting for review, for the queue's event filter. */
export async function listQueueEvents(db: DbOrTx): Promise<string[]> {
  const rows = await safeQuery(() =>
    db
      .selectDistinct({ eventLabel: registration.eventLabel })
      .from(registration)
      .where(and(eq(registration.status, "SUBMITTED"), isNotNull(registration.eventLabel)))
      .orderBy(asc(registration.eventLabel)),
  );
  return rows.map((r) => r.eventLabel!);
}

export interface RegistrationForReview {
  id: string;
  reference: string;
  channel: "SELF" | "ASSISTED";
  status: "SUBMITTED" | "CORRECTION_REQUESTED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  language: "en" | "sw";
  /** Send it back with a decision: a decision fails if the registration changed since. */
  version: number;
  eventLabel: string | null;
  capturedByUserId: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  memberId: string | null;
  /** Flags stored when the registration was submitted (BR-03, BR-06). */
  fwoConflict: boolean;
  phoneConflict: boolean;
  revisionNo: number;
  details: {
    fullName: string | null;
    fwoNumber: string | null;
    phoneE164: string | null;
    noPersonalPhone: boolean;
    isNewMember: boolean;
    hbcId: string | null;
    departmentIds: string[];
    privacyNoticeVersion: string;
    submittedByUserId: string | null;
    submittedAt: Date;
  };
  evidence: { kind: string; actorUserId: string | null; eventLabel: string | null; at: Date }[];
  decisions: { action: string; reason: string | null; actorUserId: string; at: Date }[];
  /** Checked now, not at submission: what would block approval today. */
  live: {
    fwoHeldByMember: boolean;
    phoneHeldByMember: boolean;
    /** References of other open registrations with this FWO (BR-03): reject the duplicate. */
    fwoInOpenRegistrations: string[];
  };
}

/**
 * Opens a registration for review (FR-4). Opening one is access to personal data, so it is
 * recorded (`registration.view`, BR-12, D31) before anything is returned; if the entry can't be
 * written, nothing is shown. Null when there is no such registration.
 */
export async function openRegistrationForReview(
  db: DbOrTx,
  open: { registrationId: string; actor: audit.StaffActor; requestId?: string },
): Promise<RegistrationForReview | null> {
  const { registrationId, actor, requestId } = open;
  if (!UUID.test(registrationId)) return null;
  const [row] = await safeQuery(() =>
    db
      .select({
        id: registration.id,
        reference: registration.reference,
        channel: registration.channel,
        status: registration.status,
        language: registration.language,
        version: registration.version,
        eventLabel: registration.eventLabel,
        capturedByUserId: registration.capturedByUserId,
        submittedAt: registration.createdAt,
        decidedAt: registration.decidedAt,
        memberId: registration.memberId,
        fwoConflict: registration.fwoConflict,
        phoneConflict: registration.phoneConflict,
        revisionNo: registration.currentRevisionNo,
        fullName: registrationRevision.fullName,
        fwoNumber: registrationRevision.fwoNumber,
        phoneE164: registrationRevision.phoneE164,
        noPersonalPhone: registrationRevision.noPersonalPhone,
        isNewMember: registrationRevision.isNewMember,
        hbcId: registrationRevision.hbcId,
        privacyNoticeVersion: registrationRevision.privacyNoticeVersion,
        submittedByUserId: registrationRevision.submittedByUserId,
        revisionSubmittedAt: registrationRevision.submittedAt,
      })
      .from(registration)
      .innerJoin(registrationRevision, currentRevision)
      .where(eq(registration.id, registrationId)),
  );
  if (!row) return null;

  await audit.recordAccess(db, {
    actor,
    kind: "view",
    entityType: "registration",
    entityId: registrationId,
    requestId,
  });

  // What would block approval today. Only asked while it can still be approved: once approved,
  // the FWO and phone belong to this registration's own member.
  const waiting = row.status === "SUBMITTED";
  const [departments, evidence, decisions, fwoHeldByMember, phoneHeldByMember, fwoInOpen] =
    await Promise.all([
      safeQuery(() =>
        db
          .select({ id: registrationRevisionDepartment.departmentId })
          .from(registrationRevisionDepartment)
          .where(
            and(
              eq(registrationRevisionDepartment.registrationId, registrationId),
              eq(registrationRevisionDepartment.revisionNo, row.revisionNo),
            ),
          ),
      ),
      safeQuery(() =>
        db
          .select({
            kind: verificationEvidence.kind,
            actorUserId: verificationEvidence.actorUserId,
            eventLabel: verificationEvidence.eventLabel,
            at: verificationEvidence.at,
          })
          .from(verificationEvidence)
          .where(eq(verificationEvidence.registrationId, registrationId))
          .orderBy(asc(verificationEvidence.at)),
      ),
      safeQuery(() =>
        db
          .select({
            action: registrationDecision.action,
            reason: registrationDecision.reason,
            actorUserId: registrationDecision.actorUserId,
            at: registrationDecision.at,
          })
          .from(registrationDecision)
          .where(eq(registrationDecision.registrationId, registrationId))
          .orderBy(asc(registrationDecision.at)),
      ),
      waiting && row.fwoNumber ? fwoBelongsToMember(db, row.fwoNumber) : false,
      waiting && row.phoneE164 ? phoneBelongsToMember(db, row.phoneE164) : false,
      waiting && row.fwoNumber ? openRegistrationsWithFwo(db, row.fwoNumber, registrationId) : [],
    ]);

  return {
    id: row.id,
    reference: row.reference,
    channel: row.channel,
    status: row.status,
    language: row.language,
    version: row.version,
    eventLabel: row.eventLabel,
    capturedByUserId: row.capturedByUserId,
    submittedAt: row.submittedAt,
    decidedAt: row.decidedAt,
    memberId: row.memberId,
    fwoConflict: row.fwoConflict,
    phoneConflict: row.phoneConflict,
    revisionNo: row.revisionNo,
    details: {
      fullName: row.fullName,
      fwoNumber: row.fwoNumber,
      phoneE164: row.phoneE164,
      noPersonalPhone: row.noPersonalPhone,
      isNewMember: row.isNewMember,
      hbcId: row.hbcId,
      departmentIds: departments.map((d) => d.id),
      privacyNoticeVersion: row.privacyNoticeVersion,
      submittedByUserId: row.submittedByUserId,
      submittedAt: row.revisionSubmittedAt,
    },
    evidence,
    decisions,
    live: { fwoHeldByMember, phoneHeldByMember, fwoInOpenRegistrations: fwoInOpen },
  };
}

/**
 * Why a decision was refused. Each is shown to the administrator as a plain message; none is a
 * raw database error.
 * - `not_found`: no such registration.
 * - `stale`: someone else acted on it, or it changed, since the reviewer opened it (FR-4).
 * - `captured_by_you`: BR-10, the officer who captured it can't approve it (D36: a Super
 *   Administrator approves it instead).
 * - `no_fwo`: BR-16, a new member's FWO number must be entered first.
 * - `fwo_held`: the FWO belongs to a member (BR-02, D33: reject it with a reason).
 * - `fwo_in_open_registration`: another open registration has the same FWO (BR-03, FR-4): the
 *   administrator compares them and rejects the duplicate first.
 * - `phone_held`: the phone belongs to an active or inactive member (BR-06, D28).
 * - `units`: the HBC or a department was deactivated since (BR-04).
 */
export type DecisionRefusal =
  | "not_found"
  | "stale"
  | "captured_by_you"
  | "no_fwo"
  | "fwo_held"
  | "fwo_in_open_registration"
  | "phone_held"
  | "units";

export type DecisionResult =
  { ok: true; smsId: string | null; memberId?: string } | { ok: false; reason: DecisionRefusal };

interface Decision {
  registrationId: string;
  /** The version the reviewer saw (`RegistrationForReview.version`). */
  version: number;
  actor: audit.StaffActor;
  requestId?: string;
}

/** The reason, trimmed; the caller has shown the administrator any error already. */
function validReason(input: string): string {
  const reason = checkReason(input);
  if (!reason.ok) throw new SafeError("invalid_reason", "A decision reason is 3-500 characters");
  return reason.value;
}

/** A refusal raised inside the transaction, so everything written so far rolls back. */
class Refused extends Error {
  constructor(readonly reason: DecisionRefusal) {
    super(reason);
  }
}

/**
 * Locks the registration and checks it is still the one the reviewer saw: SUBMITTED, at the
 * same version. The row lock makes a concurrent decision wait, then fail as `stale`.
 */
async function lockForDecision(tx: Transaction, decision: Decision) {
  if (!UUID.test(decision.registrationId)) throw new Refused("not_found");
  const [row] = await tx
    .select({
      reference: registration.reference,
      status: registration.status,
      version: registration.version,
      language: registration.language,
      capturedByUserId: registration.capturedByUserId,
      currentRevisionNo: registration.currentRevisionNo,
    })
    .from(registration)
    .where(eq(registration.id, decision.registrationId))
    .for("update");
  if (!row) throw new Refused("not_found");
  if (row.status !== "SUBMITTED" || row.version !== decision.version) throw new Refused("stale");
  return row;
}

/** Moves the registration on, by version, and records the decision. */
async function decide(
  tx: Transaction,
  decision: Decision,
  change: {
    status: "APPROVED" | "REJECTED" | "CORRECTION_REQUESTED";
    action: "APPROVE" | "REJECT" | "REQUEST_CORRECTION";
    reason: string | null;
    memberId?: string;
  },
) {
  const updated = await tx
    .update(registration)
    .set({
      status: change.status,
      memberId: change.memberId ?? null,
      version: sql`${registration.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(eq(registration.id, decision.registrationId), eq(registration.version, decision.version)),
    )
    .returning({ id: registration.id });
  if (updated.length !== 1) throw new Refused("stale");
  // Only the columns app_runtime may insert: Drizzle's insert() would also name `id` and `at`
  // (sending DEFAULT), which the database refuses, so the application can't choose when a
  // decision happened (database-design.md §4).
  await tx.execute(sql`
    INSERT INTO registration_decision (registration_id, action, reason, actor_user_id)
    VALUES (${decision.registrationId}, ${change.action}, ${change.reason}, ${decision.actor.userId})`);
}

async function run(
  db: DbOrTx,
  work: (tx: Transaction) => Promise<DecisionResult>,
): Promise<DecisionResult> {
  try {
    return await safeQuery(() => db.transaction(work));
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

/**
 * Approves a registration (FR-4, BR-08) in one transaction (domain-model invariant 5): the
 * member with their HBC period and declared departments, the registration APPROVED with its
 * member, the decision, the audit entries (rule 4) and the approval SMS in the outbox (FR-8).
 *
 * Refused, writing nothing, when: someone acted first (`stale`); the actor captured it (BR-10);
 * there is no FWO number yet (BR-16); the FWO belongs to a member or to another open
 * registration (BR-03), or the phone to a member, now, whatever the flags said at submission
 * (checked again here, and by the database's own unique indexes); or the HBC or a department
 * was deactivated since.
 */
export async function approveRegistration(db: DbOrTx, decision: Decision): Promise<DecisionResult> {
  const { registrationId, actor, requestId } = decision;
  return run(db, async (tx) => {
    const reg = await lockForDecision(tx, decision);
    if (reg.capturedByUserId === actor.userId) throw new Refused("captured_by_you");

    const [revision] = await tx
      .select({
        fullName: registrationRevision.fullName,
        fwoNumber: registrationRevision.fwoNumber,
        phoneE164: registrationRevision.phoneE164,
        hbcId: registrationRevision.hbcId,
      })
      .from(registrationRevision)
      .where(
        and(
          eq(registrationRevision.registrationId, registrationId),
          eq(registrationRevision.revisionNo, reg.currentRevisionNo),
        ),
      );
    // A SUBMITTED registration is never redacted, so name and HBC are always present.
    if (!revision?.fullName || !revision.hbcId) throw new Refused("not_found");
    if (!revision.fwoNumber) throw new Refused("no_fwo");
    const departmentIds = (
      await tx
        .select({ id: registrationRevisionDepartment.departmentId })
        .from(registrationRevisionDepartment)
        .where(
          and(
            eq(registrationRevisionDepartment.registrationId, registrationId),
            eq(registrationRevisionDepartment.revisionNo, reg.currentRevisionNo),
          ),
        )
    ).map((d) => d.id);

    const units = await checkUnitsForRegistration(tx, { hbcId: revision.hbcId, departmentIds });
    if (!units.ok) throw new Refused("units");
    if (await fwoBelongsToMember(tx, revision.fwoNumber)) throw new Refused("fwo_held");
    if ((await openRegistrationsWithFwo(tx, revision.fwoNumber, registrationId)).length > 0) {
      throw new Refused("fwo_in_open_registration");
    }
    if (revision.phoneE164 && (await phoneBelongsToMember(tx, revision.phoneE164))) {
      throw new Refused("phone_held");
    }

    const created = await createMember(
      tx,
      {
        fwoNumber: revision.fwoNumber,
        fullName: revision.fullName,
        phoneE164: revision.phoneE164,
        language: reg.language,
        sourceRegistrationId: registrationId,
        hbcId: revision.hbcId,
        departmentIds,
      },
      actor,
      requestId,
    );
    if (!created.ok) throw new Refused(created.reason);

    await decide(tx, decision, {
      status: "APPROVED",
      action: "APPROVE",
      reason: null,
      memberId: created.memberId,
    });
    await audit.write(tx, {
      actor,
      action: "registration.approve",
      entityType: "registration",
      entityId: registrationId,
      before: { status: "SUBMITTED" },
      after: { status: "APPROVED", memberId: created.memberId },
      requestId,
    });
    const smsId = revision.phoneE164
      ? await enqueueSms(tx, {
          phoneE164: revision.phoneE164,
          template: "registration.approved",
          language: reg.language,
          params: { reference: reg.reference },
        })
      : null;
    return { ok: true, smsId, memberId: created.memberId };
  });
}

/**
 * Rejects a registration (FR-4) with the administrator's reason: the registration REJECTED, the
 * decision and an audit entry, in one transaction. No SMS (FR-8). The usual way to resolve an
 * FWO collision (D33).
 */
export async function rejectRegistration(
  db: DbOrTx,
  decision: Decision & { reason: string },
): Promise<DecisionResult> {
  const reason = validReason(decision.reason);
  return run(db, async (tx) => {
    await lockForDecision(tx, decision);
    await decide(tx, decision, { status: "REJECTED", action: "REJECT", reason });
    await audit.write(tx, {
      actor: decision.actor,
      action: "registration.reject",
      entityType: "registration",
      entityId: decision.registrationId,
      before: { status: "SUBMITTED" },
      after: { status: "REJECTED", reason },
      requestId: decision.requestId,
    });
    return { ok: true, smsId: null };
  });
}

/**
 * Asks for a correction (FR-4, FR-5) with the administrator's reason, which only staff see: the
 * registration CORRECTION_REQUESTED, the decision, an audit entry and an SMS asking the member
 * to contact the church office (FR-8), in one transaction. A member with no personal phone gets
 * no SMS.
 */
export async function requestCorrection(
  db: DbOrTx,
  decision: Decision & { reason: string },
): Promise<DecisionResult> {
  const reason = validReason(decision.reason);
  return run(db, async (tx) => {
    const reg = await lockForDecision(tx, decision);
    await decide(tx, decision, {
      status: "CORRECTION_REQUESTED",
      action: "REQUEST_CORRECTION",
      reason,
    });
    await audit.write(tx, {
      actor: decision.actor,
      action: "registration.request_correction",
      entityType: "registration",
      entityId: decision.registrationId,
      before: { status: "SUBMITTED" },
      after: { status: "CORRECTION_REQUESTED", reason },
      requestId: decision.requestId,
    });
    const [revision] = await tx
      .select({ phoneE164: registrationRevision.phoneE164 })
      .from(registrationRevision)
      .where(
        and(
          eq(registrationRevision.registrationId, decision.registrationId),
          eq(registrationRevision.revisionNo, reg.currentRevisionNo),
        ),
      );
    const smsId = revision?.phoneE164
      ? await enqueueSms(tx, {
          phoneE164: revision.phoneE164,
          template: "registration.correction_requested",
          language: reg.language,
          params: { reference: reg.reference },
        })
      : null;
    return { ok: true, smsId };
  });
}
