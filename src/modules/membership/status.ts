import { and, eq, isNull, type SQL } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { hbc, member, memberHbcAssignment } from "../../db/schema";

/** What the status check may show about a member (FR-7, D14, D48): never the phone or departments. */
export interface MemberForStatusCheck {
  fullName: string;
  hbcName: string;
}

/**
 * The ACTIVE member that holds this phone and either this FWO number or this id, with their
 * current HBC; null when there is none. A member in any other status is not found (FR-7: an
 * inactive, deceased or transferred member gets the same answer as no match). Only for the
 * status check, after the phone has been verified by code (BR-13).
 */
export async function findActiveMemberForStatusCheck(
  db: DbOrTx,
  match: { phoneE164: string } & ({ fwoNumber: string } | { memberId: string }),
): Promise<MemberForStatusCheck | null> {
  const which: SQL =
    "fwoNumber" in match ? eq(member.fwoNumber, match.fwoNumber) : eq(member.id, match.memberId);
  const rows = await safeQuery(() =>
    db
      .select({ fullName: member.fullName, hbcName: hbc.name })
      .from(member)
      .innerJoin(
        memberHbcAssignment,
        and(eq(memberHbcAssignment.memberId, member.id), isNull(memberHbcAssignment.validTo)),
      )
      .innerJoin(hbc, eq(hbc.id, memberHbcAssignment.hbcId))
      .where(and(which, eq(member.phoneE164, match.phoneE164), eq(member.status, "ACTIVE")))
      .limit(1),
  );
  return rows[0] ?? null;
}
