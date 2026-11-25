import { and, eq, inArray } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { member } from "../../db/schema";

/**
 * Whether an FWO number already belongs to a member, in any status (BR-02: an FWO belongs to
 * at most one member, ever, including deceased and transferred members). For flagging a
 * registration (BR-03); the answer is never shown to the public.
 */
export async function fwoBelongsToMember(db: DbOrTx, fwoNumber: string): Promise<boolean> {
  const rows = await safeQuery(() =>
    db.select({ id: member.id }).from(member).where(eq(member.fwoNumber, fwoNumber)).limit(1),
  );
  return rows.length > 0;
}

/**
 * Whether a phone already belongs to an active or inactive member (BR-06). For flagging a
 * registration PHONE_CONFLICT; the answer is never shown to the public.
 */
export async function phoneBelongsToMember(db: DbOrTx, phoneE164: string): Promise<boolean> {
  const rows = await safeQuery(() =>
    db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.phoneE164, phoneE164), inArray(member.status, ["ACTIVE", "INACTIVE"])))
      .limit(1),
  );
  return rows.length > 0;
}
