import { isUniqueViolation, safeQuery, type Transaction } from "../../db";
import { departmentMembership, member, memberHbcAssignment } from "../../db/schema";
import * as audit from "../audit";

export interface NewMember {
  fwoNumber: string;
  fullName: string;
  /** Null when the member has no personal phone (BR-06). */
  phoneE164: string | null;
  language: "en" | "sw";
  sourceRegistrationId: string;
  hbcId: string;
  departmentIds: string[];
}

export type CreateMemberResult =
  | { ok: true; memberId: string }
  /** BR-02 / D2: the FWO number already belongs to a member (`member_fwo_uq`). */
  | { ok: false; reason: "fwo_held" }
  /** D20: the phone belongs to an active or inactive member (`member_phone_uq`). */
  | { ok: false; reason: "phone_held" };

/**
 * Creates a member from an approved registration (FR-4, domain-model invariant 5): the member
 * (ACTIVE), their one open HBC period (BR-04) and a DECLARED membership for each department
 * (BR-05), with a `member.create` audit entry (rule 4). Runs inside the caller's transaction,
 * which approves the registration, so all of it commits together or not at all.
 *
 * The member insert runs in a savepoint: if the database refuses the FWO or phone as already
 * held (a race the caller's own checks can't see), the answer says which, and the caller's
 * transaction can still roll back cleanly with a clear message instead of a raw error.
 */
export async function createMember(
  tx: Transaction,
  details: NewMember,
  actor: audit.StaffActor,
  requestId?: string,
): Promise<CreateMemberResult> {
  let memberId: string;
  try {
    const [row] = await safeQuery(() =>
      tx.transaction((savepoint) =>
        savepoint
          .insert(member)
          .values({
            fwoNumber: details.fwoNumber,
            fullName: details.fullName,
            phoneE164: details.phoneE164,
            language: details.language,
            sourceRegistrationId: details.sourceRegistrationId,
          })
          .returning({ id: member.id }),
      ),
    );
    memberId = row!.id;
  } catch (error) {
    if (isUniqueViolation(error, "member_fwo_uq")) return { ok: false, reason: "fwo_held" };
    if (isUniqueViolation(error, "member_phone_uq")) return { ok: false, reason: "phone_held" };
    throw error;
  }

  await safeQuery(() => tx.insert(memberHbcAssignment).values({ memberId, hbcId: details.hbcId }));
  if (details.departmentIds.length > 0) {
    await safeQuery(() =>
      tx.insert(departmentMembership).values(
        details.departmentIds.map((departmentId) => ({
          memberId,
          departmentId,
          state: "DECLARED" as const,
        })),
      ),
    );
  }

  // The details are in the member record; the entry says where it came from and what it holds.
  await audit.write(tx, {
    actor,
    action: "member.create",
    entityType: "member",
    entityId: memberId,
    after: {
      status: "ACTIVE",
      sourceRegistrationId: details.sourceRegistrationId,
      hbcId: details.hbcId,
      departments: details.departmentIds.length,
      noPersonalPhone: details.phoneE164 === null,
    },
    requestId,
  });
  return { ok: true, memberId };
}
