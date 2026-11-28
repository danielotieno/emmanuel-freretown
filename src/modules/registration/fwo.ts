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
import { checkUnitsForRegistration } from "../organisation";
import { checkFwoNumber } from "./fields";
import { openRegistrationsWithFwo, PRIVACY_NOTICE_VERSION } from "./intake";

/**
 * New members' FWO numbers (#101, BR-16, D30). The Church Secretary records once the highest
 * FWO number ever issued; the system suggests the next one; the Secretary enters the number they
 * issued on a new member's registration, as a new revision (BR-09). Callers check the
 * Membership Administrator role first (CLAUDE.md rule 1).
 *
 * "Issued by the platform" means a revision of a new member's registration that carries an FWO
 * number: only `issueFwoNumber` writes those. They hold D2 ("never reused") for numbers issued
 * to registrations later rejected or withdrawn, until retention removes them (BR-14).
 *
 * FWO numbers are stored without leading zeros (BR-01, D61), so the suggestion has none either:
 * after 53 it is 54, and a Secretary who types "054" issues the same number. "The next number
 * above" orders them as numbers, not as text, so 100 comes after 99.
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

/** The largest FWO number the platform has issued (see above), as a number, or null. */
function highestIssuedHere(db: DbOrTx) {
  return safeQuery(() =>
    db.execute<{ highest: string | null }>(sql`
      SELECT max(fwo_number::numeric)::text AS highest
        FROM registration_revision
       WHERE is_new_member AND fwo_number IS NOT NULL`),
  ).then((r) => r.rows[0]?.highest ?? null);
}

export type SetHighestResult =
  | { ok: true }
  | { ok: false; reason: "invalid" }
  /** Lower than a number the platform has already issued: D2 would no longer hold. */
  | { ok: false; reason: "below_issued"; highestIssued: string };

/**
 * Records or changes D30's setting: digits only, leading zeros dropped (BR-01, D61), and never below
 * a number the platform has issued. Audited as `fwo_setting.update` with the old and new values:
 * a counter, filed under the setting, written by this action alone and never alongside a
 * registration's entries, so it can't be tied to one person.
 */
export async function setHighestFwoIssued(
  db: DbOrTx,
  change: { value: string; actor: audit.StaffActor; requestId?: string },
): Promise<SetHighestResult> {
  const checked = checkFwoNumber(change.value, false);
  if (!checked.ok || checked.value === null) return { ok: false, reason: "invalid" };
  const value = checked.value;
  return safeQuery(() =>
    db.transaction(async (tx): Promise<SetHighestResult> => {
      const issued = await highestIssuedHere(tx);
      if (issued !== null && BigInt(value) < BigInt(issued)) {
        return { ok: false, reason: "below_issued", highestIssued: issued };
      }
      // The old value, locked, for the audit entry; then insert or update in one statement,
      // so two first saves at once can't both insert (the second updates instead).
      const [old] = await tx
        .select({ value: fwoSetting.highestIssued })
        .from(fwoSetting)
        .for("update");
      const { rows } = await tx.execute<{ id: string }>(sql`
        INSERT INTO fwo_setting (highest_issued, updated_by_user_id)
        VALUES (${value}, ${change.actor.userId})
        ON CONFLICT (singleton) DO UPDATE
           SET highest_issued = EXCLUDED.highest_issued,
               updated_by_user_id = EXCLUDED.updated_by_user_id,
               updated_at = now()
        RETURNING id`);
      const row = rows[0]!;
      await audit.write(tx, {
        actor: change.actor,
        action: "fwo_setting.update",
        entityType: "fwo_setting",
        entityId: row.id,
        before: old ? { highestIssued: old.value } : undefined,
        after: { highestIssued: value },
        requestId: change.requestId,
      });
      return { ok: true };
    }),
  );
}

/**
 * D30's suggestion: one more than the largest of the setting and every member's FWO number,
 * ordered as numbers. Numbers on open registrations are left out: anyone can type one on the
 * public form, and BR-03 already refuses a number another open registration holds. Null until
 * the setting is recorded: without it the suggestion could reuse an old number (D2).
 */
export async function suggestFwoNumber(db: DbOrTx): Promise<string | null> {
  const result = await safeQuery(() =>
    db.execute<{ next: string | null }>(sql`
      SELECT (GREATEST(s.highest_issued::numeric, (SELECT max(fwo_number::numeric) FROM member))
              + 1)::text AS next
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
  /** The privacy notice changed since the member consented: the Secretary must confirm (D35). */
  | "notice_changed"
  | "fwo_invalid"
  | "fwo_held"
  | "fwo_in_open_registration"
  /** The platform issued this number before, to a registration since rejected or withdrawn (D2). */
  | "fwo_issued_before"
  /** The new member's HBC isn't known yet, and none was chosen (D49). */
  | "hbc_required"
  /** The HBC chosen isn't an active one (BR-04). */
  | "hbc_unavailable";

export type IssueFwoResult = { ok: true } | { ok: false; reason: IssueFwoRefusal };

class Refused extends Error {
  constructor(readonly reason: IssueFwoRefusal) {
    super(reason);
  }
}

/**
 * Enters the FWO number the Church Secretary issued to a new member (BR-16), in one
 * transaction: revision n + 1 (every field of revision n with the number, and the HBC the
 * Secretary chose when the member didn't know theirs, D49) and its departments;
 * the registration moved to it, version bumped; `FWO_CONFIRMED_BY_SECRETARY` evidence; the
 * setting raised if the number is higher (D30, so it is never suggested again, D2); and a
 * `registration.issue_fwo` audit entry (rule 4) that records whether the suggestion was taken
 * and whether the setting was raised, never the number, so retention can remove every trace of
 * it with the registration (BR-14).
 *
 * Consent (D35, BR-15): the declarations and consent carry over while the privacy notice is the
 * one the member consented to. If it has changed since, the Secretary, who is with the member,
 * confirms the member consents to the current notice (`consentToCurrentNotice`), and the new
 * revision records the current version; without that the number is refused.
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
    /**
     * D49: the HBC the Secretary sets for a new member who didn't know theirs. Required when the
     * registration has none; ignored when it has one.
     */
    hbcId?: string;
    consentToCurrentNotice?: boolean;
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
        const noticeChanged = reg.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION;
        if (noticeChanged && !issue.consentToCurrentNotice) throw new Refused("notice_changed");
        if (await fwoBelongsToMember(tx, fwoNumber)) throw new Refused("fwo_held");
        if ((await openRegistrationsWithFwo(tx, fwoNumber, registrationId)).length > 0) {
          throw new Refused("fwo_in_open_registration");
        }
        const [issuedBefore] = await tx
          .select({ id: registrationRevision.registrationId })
          .from(registrationRevision)
          .where(
            and(
              eq(registrationRevision.isNewMember, true),
              eq(registrationRevision.fwoNumber, fwoNumber),
            ),
          )
          .limit(1);
        if (issuedBefore) throw new Refused("fwo_issued_before");

        // D49: a new member who didn't know their HBC gets it now, from the Secretary.
        let hbcSet: string | null = null;
        if (reg.hbcId === null) {
          if (!issue.hbcId) throw new Refused("hbc_required");
          const units = await checkUnitsForRegistration(tx, {
            hbcId: issue.hbcId,
            departmentIds: [],
          });
          if (!units.ok) throw new Refused("hbc_unavailable");
          hbcSet = issue.hbcId;
        }

        const next = reg.currentRevisionNo + 1;
        const notice = noticeChanged ? PRIVACY_NOTICE_VERSION : reg.privacyNoticeVersion;
        await tx.execute(sql`
          INSERT INTO registration_revision
            (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
             adult_declared, transfer_consent, is_new_member, no_personal_phone,
             privacy_notice_version, submitted_by_user_id)
          SELECT registration_id, ${next}, full_name, ${fwoNumber}, phone_e164,
                 COALESCE(${hbcSet}::uuid, hbc_id),
                 adult_declared, transfer_consent, is_new_member, no_personal_phone,
                 ${notice}, ${actor.userId}
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

        await audit.write(tx, {
          actor,
          action: "registration.issue_fwo",
          entityType: "registration",
          entityId: registrationId,
          after: {
            revisionNo: next,
            suggestionTaken: fwoNumber === suggested,
            settingRaised: raised.length === 1,
            ...(hbcSet ? { hbcId: hbcSet } : {}),
            ...(noticeChanged ? { consentToNotice: PRIVACY_NOTICE_VERSION } : {}),
          },
          requestId,
        });
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
      privacyNoticeVersion: registrationRevision.privacyNoticeVersion,
      hbcId: registrationRevision.hbcId,
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
  return { ...row, privacyNoticeVersion: revision.privacyNoticeVersion, hbcId: revision.hbcId };
}
