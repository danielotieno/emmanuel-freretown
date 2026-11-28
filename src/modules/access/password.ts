import { and, eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { safeQuery, type DbOrTx } from "../../db";
import { account, user as userTable } from "../../db/schema/auth";
import * as audit from "../audit";
import { endSessions } from "./accounts";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./auth";

export type PasswordChangeRefusal =
  | "wrong_password"
  | "too_short"
  | "too_long"
  /** The new password is the current one. */
  | "unchanged";

export type PasswordChangeResult = { ok: true } | { ok: false; reason: PasswordChangeRefusal };

class Refused extends Error {
  constructor(readonly reason: PasswordChangeRefusal) {
    super(reason);
  }
}

/**
 * A staff member changes their own password (FR-10, #91): required while they hold a temporary
 * one from a Super Administrator, and open to any signed-in staff member. Their other sessions
 * end; this one carries on. Audited as `staff_user.change_password` in the same transaction.
 * The caller has checked the session (`requirePasswordChange`), so `userId` and `sessionId` are
 * the signed-in staff member's own.
 */
export async function changeOwnPassword(
  db: DbOrTx,
  input: {
    userId: string;
    sessionId: string;
    currentPassword: string;
    newPassword: string;
    requestId?: string;
  },
): Promise<PasswordChangeResult> {
  const { userId, currentPassword, newPassword } = input;
  if (newPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "too_short" };
  if (newPassword.length > MAX_PASSWORD_LENGTH) return { ok: false, reason: "too_long" };
  if (newPassword === currentPassword) return { ok: false, reason: "unchanged" };
  try {
    await db.transaction(async (tx) => {
      // The user row first, then the login: the order a Super Administrator's reset takes
      // (accounts.ts), so a change and a reset at the same moment queue instead of deadlocking.
      await safeQuery(() =>
        tx
          .select({ id: userTable.id })
          .from(userTable)
          .where(eq(userTable.id, userId))
          .for("no key update"),
      );
      const credential = and(eq(account.userId, userId), eq(account.providerId, "credential"));
      const [found] = await safeQuery(() =>
        tx.select({ hash: account.password }).from(account).where(credential).for("update"),
      );
      if (
        !found?.hash ||
        currentPassword.length > MAX_PASSWORD_LENGTH ||
        !(await verifyPassword({ hash: found.hash, password: currentPassword }))
      ) {
        throw new Refused("wrong_password");
      }
      const newHash = await hashPassword(newPassword);
      await safeQuery(() => tx.update(account).set({ password: newHash }).where(credential));
      await safeQuery(() =>
        tx.update(userTable).set({ mustChangePassword: false }).where(eq(userTable.id, userId)),
      );
      const sessionsEnded = await endSessions(tx, userId, input.sessionId);
      await audit.write(tx, {
        actor: { type: "STAFF", userId },
        action: "staff_user.change_password",
        entityType: "staff_user",
        entityId: userId,
        after: { sessionsEnded },
        requestId: input.requestId,
      });
    });
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
  return { ok: true };
}
