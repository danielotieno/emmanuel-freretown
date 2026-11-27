import { and, eq, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  fwoSetting,
  registration,
  registrationRevision,
  verificationEvidence,
} from "../../db/schema";
import * as audit from "../audit";
import { fwoBelongsToMember } from "../membership";
import { checkFwoNumber } from "./fields";
import { openRegistrationsWithFwo } from "./intake";

/**
 * New members' FWO numbers (#101, BR-16, D30). The Church Secretary records once the highest
 * FWO number ever issued; the system suggests the next one; the Secretary enters the number they
 * issued on a new member's registration, as a new revision (BR-09). Callers check the
 * Membership Administrator role first (CLAUDE.md rule 1).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface HighestFwoIssued {
  value: string;
  updatedAt: Date;
  updatedByUserId: string;
}

/** D30's setting, or null until the Secretary records it. */
export async function getHighestFwoIssued(db: DbOrTx): Promise<HighestFwoIssued | null> {
  const [row] = await safeQuery(() =>
    db
      .select({
        value: fwoSetting.highestIssued,
        updatedAt: fwoSetting.updatedAt,
        updatedByUserId: fwoSetting.updatedByUserId,
      })
      .from(fwoSetting),
  );
  return row ?? null;
}

/**
 * Records or changes D30's setting: digits only (BR-01), kept exactly as typed. Audited as
 * `fwo_setting.update` with the old and new values (a counter, not anyone's details).
 */
export async function setHighestFwoIssued(
  db: DbOrTx,
  change: { value: string; actor: audit.StaffActor; requestId?: string },
): Promise<{ ok: true } | { ok: false; reason: "invalid" }> {
  const checked = checkFwoNumber(change.value, false);
  if (!checked.ok || checked.value === null) return { ok: false, reason: "invalid" };
  const value = checked.value;
  return safeQuery(() =>
    db.transaction(async (tx) => {
      const [before] = await tx
        .select({ id: fwoSetting.id, value: fwoSetting.highestIssued })
        .from(fwoSetting)
        .for("update");
      const [row] = before
        ? await tx
            .update(fwoSetting)
            .set({
              highestIssued: value,
              updatedAt: sql`now()`,
              updatedByUserId: change.actor.userId,
            })
            .where(eq(fwoSetting.id, before.id))
            .returning({ id: fwoSetting.id })
        : await tx
            .insert(fwoSetting)
            .values({ highestIssued: value, updatedByUserId: change.actor.userId })
            .returning({ id: fwoSetting.id });
      await audit.write(tx, {
        actor: change.actor,
        action: "fwo_setting.update",
        entityType: "fwo_setting",
        entityId: row!.id,
        before: before ? { highestIssued: before.value } : undefined,
        after: { highestIssued: value },
        requestId: change.requestId,
      });
      return { ok: true } as const;
    }),
  );
}

/**
 * D30's suggestion: one more than the largest of the setting, every member's FWO number and
 * every open registration's current FWO number, compared as numbers, so "0042" counts as 42
 * (D29). Null until the setting is recorded: without it the suggestion could reuse an old
 * number (D2).
 */
export async function suggestFwoNumber(db: DbOrTx): Promise<string | null> {
  const result = await safeQuery(() =>
    db.execute<{ next: string | null }>(sql`
      SELECT (GREATEST(
                s.highest_issued::numeric,
                (SELECT max(fwo_number::numeric) FROM member),
                (SELECT max(rev.fwo_number::numeric)
                   FROM registration r
                   JOIN registration_revision rev
                     ON rev.registration_id = r.id AND rev.revision_no = r.current_revision_no
                  WHERE r.status IN ('SUBMITTED','CORRECTION_REQUESTED'))
              ) + 1)::text AS next
        FROM fwo_setting s`),
  );
  return result.rows[0]?.next ?? null;
}

export type IssueFwoRefusal =
  | "not_found"
  /** Someone acted on the registration first, or it changed since it was opened. */
  | "stale"
  /** Not a new member waiting for a number: it has one already, or isn't SUBMITTED. */
  | "not_waiting_for_fwo"
  /** D30's setting isn't recorded yet. */
  | "no_setting"
  | "fwo_invalid"
  | "fwo_held"
  | "fwo_in_open_registration";

export type IssueFwoResult = { ok: true } | { ok: false; reason: IssueFwoRefusal };

class Refused extends Error {
  constructor(readonly reason: IssueFwoRefusal) {
    super(reason);
  }
}

/**
 * Enters the FWO number the Church Secretary issued to a new member (BR-16), in one
 * transaction: revision n + 1 (every field of revision n with the number, the declarations,
 * consent and notice version carried over unchanged, D35) and its departments; the registration
 * moved to it, version bumped; `FWO_CONFIRMED_BY_SECRETARY` evidence; the setting raised if the
 * number is higher (D30, so a number issued is never suggested again, D2); a
 * `registration.issue_fwo` audit entry, and `fwo_setting.update` when raised (rule 4).
 *
 * The setting's row is locked first, so two numbers are never issued at once: without that, two
 * Secretaries taking the same suggestion would both pass the "not in use" checks.
 */
export async function issueFwoNumber(
  db: DbOrTx,
  issue: {
    registrationId: string;
    version: number;
    fwoNumber: string;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<IssueFwoResult> {
  const { registrationId, actor, requestId } = issue;
  if (!UUID.test(registrationId)) return { ok: false, reason: "not_found" };
  const checked = checkFwoNumber(issue.fwoNumber, false);
  if (!checked.ok || checked.value === null) return { ok: false, reason: "fwo_invalid" };
  const fwoNumber = checked.value;

  try {
    return await safeQuery(() =>
      db.transaction(async (tx): Promise<IssueFwoResult> => {
        const [setting] = await tx
          .select({ id: fwoSetting.id, value: fwoSetting.highestIssued })
          .from(fwoSetting)
          .for("update");
        if (!setting) throw new Refused("no_setting");
        const suggested = await suggestFwoNumber(tx);

        const reg = await lockNewMember(tx, registrationId, issue.version);
        if (await fwoBelongsToMember(tx, fwoNumber)) throw new Refused("fwo_held");
        if ((await openRegistrationsWithFwo(tx, fwoNumber, registrationId)).length > 0) {
          throw new Refused("fwo_in_open_registration");
        }

        const next = reg.currentRevisionNo + 1;
        await tx.execute(sql`
          INSERT INTO registration_revision
            (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
             adult_declared, transfer_consent, is_new_member, no_personal_phone,
             privacy_notice_version, submitted_by_user_id)
          SELECT registration_id, ${next}, full_name, ${fwoNumber}, phone_e164, hbc_id,
                 adult_declared, transfer_consent, is_new_member, no_personal_phone,
                 privacy_notice_version, ${actor.userId}
            FROM registration_revision
           WHERE registration_id = ${registrationId} AND revision_no = ${reg.currentRevisionNo}`);
        await tx.execute(sql`
          INSERT INTO registration_revision_department (registration_id, revision_no, department_id)
          SELECT registration_id, ${next}, department_id
            FROM registration_revision_department
           WHERE registration_id = ${registrationId} AND revision_no = ${reg.currentRevisionNo}`);
        const moved = await tx
          .update(registration)
          .set({
            currentRevisionNo: next,
            version: sql`${registration.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(registration.id, registrationId), eq(registration.version, issue.version)))
          .returning({ id: registration.id });
        if (moved.length !== 1) throw new Refused("stale");

        await tx.insert(verificationEvidence).values({
          registrationId,
          kind: "FWO_CONFIRMED_BY_SECRETARY",
          actorUserId: actor.userId,
        });
        await audit.write(tx, {
          actor,
          action: "registration.issue_fwo",
          entityType: "registration",
          entityId: registrationId,
          after: { revisionNo: next, suggestionTaken: fwoNumber === suggested },
          requestId,
        });

        const raised = await tx
          .update(fwoSetting)
          .set({ highestIssued: fwoNumber, updatedAt: sql`now()`, updatedByUserId: actor.userId })
          .where(
            and(
              eq(fwoSetting.id, setting.id),
              sql`${fwoSetting.highestIssued}::numeric < ${fwoNumber}::numeric`,
            ),
          )
          .returning({ id: fwoSetting.id });
        if (raised.length === 1) {
          await audit.write(tx, {
            actor,
            action: "fwo_setting.update",
            entityType: "fwo_setting",
            entityId: setting.id,
            before: { highestIssued: setting.value },
            after: { highestIssued: fwoNumber },
            requestId,
          });
        }
        return { ok: true };
      }),
    );
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

/**
 * Locks the registration and checks it is the new member's registration the Secretary saw:
 * SUBMITTED, at the same version, its current revision a new member's with no FWO number yet.
 */
async function lockNewMember(tx: Transaction, registrationId: string, version: number) {
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
  if (row.version !== version) throw new Refused("stale");
  const [revision] = await tx
    .select({
      isNewMember: registrationRevision.isNewMember,
      fwoNumber: registrationRevision.fwoNumber,
    })
    .from(registrationRevision)
    .where(
      and(
        eq(registrationRevision.registrationId, registrationId),
        eq(registrationRevision.revisionNo, row.currentRevisionNo),
      ),
    );
  if (row.status !== "SUBMITTED" || !revision?.isNewMember || revision.fwoNumber !== null) {
    throw new Refused("not_waiting_for_fwo");
  }
  return row;
}
