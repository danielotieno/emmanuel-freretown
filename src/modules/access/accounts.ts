import { and, asc, count, eq, gt, isNull, ne } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import { roleAssignment } from "../../db/schema/access";
import {
  account,
  session as sessionTable,
  twoFactor,
  user as userTable,
} from "../../db/schema/auth";
import * as audit from "../audit";
import { randomString } from "./random";
import { STAFF_ROLES, type StaffRole } from "./roles";

/**
 * Staff account management by Super Administrators (FR-10, #91): create a staff user with a
 * temporary password, grant and revoke roles (GLOBAL in Release 1), reset a lost authenticator
 * app or a forgotten password, and sign a staff member out everywhere. Each change locks the
 * staff user's row and writes its audit entry in the same transaction (CLAUDE.md rule 4).
 * Callers check for a Super Administrator first (rule 1).
 *
 * Two safeguards (D59): a Super Administrator never acts on their own account here (the other
 * Super Administrator does, D40), and the last active Super Administrator keeps the role.
 */

/** A staff user as the staff accounts page lists them. */
export interface StaffAccount {
  id: string;
  name: string;
  email: string;
  /** Active GLOBAL roles, in the order of STAFF_ROLES. */
  roles: StaffRole[];
  hasAuthenticator: boolean;
  /** Still holds a temporary password from a Super Administrator. */
  mustChangePassword: boolean;
  /** Sessions not yet expired. An idle one counts until it is next used or purged. */
  openSessions: number;
}

export type StaffChangeRefusal =
  | "not_found"
  | "unchanged"
  /** Super Administrators don't change their own account here (D59). */
  | "self"
  /** The only active Super Administrator keeps the role (D59). */
  | "last_super_admin";

export type StaffChangeResult = { ok: true } | { ok: false; reason: StaffChangeRefusal };

/** The same, with the temporary password to hand to the staff member once. */
export type TemporaryPasswordResult =
  { ok: true; temporaryPassword: string } | { ok: false; reason: StaffChangeRefusal };

export type StaffInputError = "required" | "invalid" | "too_long";

export interface NewStaffUser {
  name: string;
  email: string;
  roles: readonly string[];
}

export type CreateStaffResult =
  | { ok: true; userId: string; temporaryPassword: string }
  | { ok: false; reason: "email_taken" }
  | {
      ok: false;
      reason: "invalid";
      errors: Partial<Record<keyof NewStaffUser, StaffInputError>>;
    };

const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Letters and digits that can't be mistaken for one another when read aloud or copied. */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * A temporary password: 16 characters from 55 (about 92 bits), in groups of four so it can be
 * read out. The Super Administrator sees it once; it is stored only as Better Auth's hash.
 */
export function temporaryPassword(): string {
  return randomString(16, PASSWORD_ALPHABET).replace(/(.{4})(?!$)/g, "$1-");
}

/** A staff user's name (NFC, trimmed, single spaces) and email (lowercase), or what's wrong. */
export function checkNewStaffUser(
  input: NewStaffUser,
):
  | { ok: true; value: { name: string; email: string; roles: StaffRole[] } }
  | { ok: false; errors: Partial<Record<keyof NewStaffUser, StaffInputError>> } {
  const name = input.name.normalize("NFC").trim().replace(/\s+/g, " ");
  const email = input.email.trim().toLowerCase();
  const roles = STAFF_ROLES.filter((r) => input.roles.includes(r));
  const errors: Partial<Record<keyof NewStaffUser, StaffInputError>> = {};
  if (!name) errors.name = "required";
  else if (/[\p{Cc}\p{Cf}]/u.test(name)) errors.name = "invalid";
  else if ([...name].length > MAX_NAME_LENGTH) errors.name = "too_long";
  if (!email) errors.email = "required";
  else if (email.length > MAX_EMAIL_LENGTH) errors.email = "too_long";
  else if (!EMAIL.test(email)) errors.email = "invalid";
  if (roles.length === 0) errors.roles = "required";
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { name, email, roles } };
}

/** Every staff user, by name, or just one (`id`). A staff page: not recorded (D31). */
export async function listStaff(db: DbOrTx, id?: string): Promise<StaffAccount[]> {
  const now = new Date();
  const [users, grants, sessions] = await Promise.all([
    safeQuery(() =>
      db
        .select({
          id: userTable.id,
          name: userTable.name,
          email: userTable.email,
          hasAuthenticator: userTable.twoFactorEnabled,
          mustChangePassword: userTable.mustChangePassword,
        })
        .from(userTable)
        .where(id === undefined ? undefined : eq(userTable.id, id))
        .orderBy(asc(userTable.name), asc(userTable.id)),
    ),
    safeQuery(() =>
      db
        .select({ userId: roleAssignment.userId, role: roleAssignment.role })
        .from(roleAssignment)
        .where(and(isNull(roleAssignment.revokedAt), eq(roleAssignment.scopeType, "GLOBAL"))),
    ),
    safeQuery(() =>
      db
        .select({ userId: sessionTable.userId, open: count() })
        .from(sessionTable)
        .where(gt(sessionTable.expiresAt, now))
        .groupBy(sessionTable.userId),
    ),
  ]);
  const openSessions = new Map(sessions.map((s) => [s.userId, s.open]));
  return users.map((u) => ({
    ...u,
    hasAuthenticator: u.hasAuthenticator === true,
    roles: STAFF_ROLES.filter((r) => grants.some((g) => g.userId === u.id && g.role === r)),
    openSessions: openSessions.get(u.id) ?? 0,
  }));
}

/**
 * Creates a staff user with the roles given, GLOBAL, and a temporary password they must replace
 * at their first sign-in, before setting up an authenticator app. No self sign-up (FR-10).
 */
export async function createStaffUser(
  db: DbOrTx,
  input: NewStaffUser & { actor: audit.StaffActor; requestId?: string },
): Promise<CreateStaffResult> {
  const checked = checkNewStaffUser(input);
  if (!checked.ok) return { ok: false, reason: "invalid", errors: checked.errors };
  const { name, email, roles } = checked.value;
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const userId = randomString(32, ID_ALPHABET);
  const { actor, requestId } = input;
  try {
    await db.transaction(async (tx) => {
      await safeQuery(() =>
        tx.insert(userTable).values({ id: userId, name, email, mustChangePassword: true }),
      );
      // Better Auth's email-and-password login: provider "credential", account id = user id.
      await safeQuery(() =>
        tx.insert(account).values({
          id: randomString(32, ID_ALPHABET),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        }),
      );
      await audit.write(tx, {
        actor,
        action: "staff_user.create",
        entityType: "staff_user",
        entityId: userId,
        after: { source: "staff_portal" },
        requestId,
      });
      for (const role of roles) await insertGrant(tx, userId, role, actor, requestId);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: "email_taken" };
    throw error;
  }
  return { ok: true, userId, temporaryPassword: password };
}

interface Change {
  userId: string;
  actor: audit.StaffActor;
  requestId?: string;
}

class Refused extends Error {
  constructor(readonly reason: StaffChangeRefusal) {
    super(reason);
  }
}

/**
 * Runs a change to another staff user's account with their row locked, so changes to one
 * account queue. FOR NO KEY UPDATE, not FOR UPDATE: a sign-in inserting a session (whose foreign
 * key takes FOR KEY SHARE on the user) must not wait for it. A refusal rolls everything back.
 */
async function change(
  db: DbOrTx,
  c: Change,
  run: (tx: Transaction) => Promise<void>,
  { allowSelf = false } = {},
): Promise<StaffChangeResult> {
  if (!allowSelf && c.userId === c.actor.userId) return { ok: false, reason: "self" };
  try {
    await db.transaction(async (tx) => {
      const found = await safeQuery(() =>
        tx
          .select({ id: userTable.id })
          .from(userTable)
          .where(eq(userTable.id, c.userId))
          .for("no key update"),
      );
      if (found.length === 0) throw new Refused("not_found");
      await run(tx);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

function entry(
  c: Change,
  verb: string,
  values: { before?: audit.AuditValues; after?: audit.AuditValues } = {},
): audit.AuditEntry {
  return {
    actor: c.actor,
    action: `staff_user.${verb}`,
    entityType: "staff_user",
    entityId: c.userId,
    ...values,
    requestId: c.requestId,
  };
}

async function insertGrant(
  tx: Transaction,
  userId: string,
  role: StaffRole,
  actor: audit.StaffActor,
  requestId?: string,
): Promise<void> {
  await safeQuery(() =>
    tx.insert(roleAssignment).values({ userId, role, grantedByUserId: actor.userId }),
  );
  await audit.write(
    tx,
    entry({ userId, actor, requestId }, "grant_role", { after: { role, scope: "GLOBAL" } }),
  );
}

/** Ends a staff user's sessions, except `keep` if given. Returns how many ended. */
export async function endSessions(tx: Transaction, userId: string, keep?: string): Promise<number> {
  const ended = await safeQuery(() =>
    tx
      .delete(sessionTable)
      .where(
        and(
          eq(sessionTable.userId, userId),
          keep === undefined ? undefined : ne(sessionTable.id, keep),
        ),
      )
      .returning({ id: sessionTable.id }),
  );
  return ended.length;
}

/** Grants a role, GLOBAL. Refused as unchanged if they hold it already. */
export async function grantRole(
  db: DbOrTx,
  c: Change & { role: StaffRole },
): Promise<StaffChangeResult> {
  try {
    return await change(db, c, (tx) => insertGrant(tx, c.userId, c.role, c.actor, c.requestId), {
      // Granting yourself a role is allowed: a Super Administrator may also staff the desk.
      allowSelf: true,
    });
  } catch (error) {
    // role_assignment_active_uq: one active grant per user, role and scope.
    if (isUniqueViolation(error)) return { ok: false, reason: "unchanged" };
    throw error;
  }
}

/**
 * Revokes a role. Takes effect on the staff member's next request: `requireStaff` reads the
 * grants every time. The last active Super Administrator keeps the role (D59). The active
 * Super Administrator grants are locked first, so concurrent revokes queue; under READ
 * COMMITTED the one that waited counts again without the grant just revoked.
 */
export async function revokeRole(
  db: DbOrTx,
  c: Change & { role: StaffRole },
): Promise<StaffChangeResult> {
  return change(db, c, async (tx) => {
    if (c.role === "SUPER_ADMIN") {
      const superAdmins = await safeQuery(() =>
        tx
          .select({ id: roleAssignment.id })
          .from(roleAssignment)
          .where(and(eq(roleAssignment.role, "SUPER_ADMIN"), isNull(roleAssignment.revokedAt)))
          .for("update"),
      );
      if (superAdmins.length <= 1) throw new Refused("last_super_admin");
    }
    const revoked = await safeQuery(() =>
      tx
        .update(roleAssignment)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(roleAssignment.userId, c.userId),
            eq(roleAssignment.role, c.role),
            eq(roleAssignment.scopeType, "GLOBAL"),
            isNull(roleAssignment.revokedAt),
          ),
        )
        .returning({ id: roleAssignment.id }),
    );
    if (revoked.length === 0) throw new Refused("unchanged");
    await audit.write(tx, entry(c, "revoke_role", { before: { role: c.role, scope: "GLOBAL" } }));
  });
}

/**
 * For a lost phone: removes the authenticator app and its backup codes and ends every session.
 * At their next sign-in, with their password, the staff member sets up an app again. The flag
 * goes back to false too, so that set-up is audited (`staff_user.enable_second_factor`).
 */
export async function resetSecondFactor(db: DbOrTx, c: Change): Promise<StaffChangeResult> {
  return change(db, c, async (tx) => {
    const removed = await safeQuery(() =>
      tx.delete(twoFactor).where(eq(twoFactor.userId, c.userId)).returning({ id: twoFactor.id }),
    );
    const flagged = await safeQuery(() =>
      tx
        .update(userTable)
        .set({ twoFactorEnabled: false })
        .where(and(eq(userTable.id, c.userId), eq(userTable.twoFactorEnabled, true)))
        .returning({ id: userTable.id }),
    );
    if (removed.length === 0 && flagged.length === 0) throw new Refused("unchanged");
    const sessionsEnded = await endSessions(tx, c.userId);
    await audit.write(tx, entry(c, "reset_second_factor", { after: { sessionsEnded } }));
  });
}

/**
 * For a forgotten password: a new temporary password, which the staff member replaces at their
 * next sign-in (after the authenticator app's code, if they have one). Ends every session.
 */
export async function resetPassword(db: DbOrTx, c: Change): Promise<TemporaryPasswordResult> {
  const password = temporaryPassword();
  const result = await change(db, c, async (tx) => {
    // Hashed here, after the cheap refusals (own account, unknown user).
    const passwordHash = await hashPassword(password);
    const updated = await safeQuery(() =>
      tx
        .update(account)
        .set({ password: passwordHash })
        .where(and(eq(account.userId, c.userId), eq(account.providerId, "credential")))
        .returning({ id: account.id }),
    );
    if (updated.length === 0) throw new Refused("not_found");
    await safeQuery(() =>
      tx.update(userTable).set({ mustChangePassword: true }).where(eq(userTable.id, c.userId)),
    );
    const sessionsEnded = await endSessions(tx, c.userId);
    await audit.write(tx, entry(c, "reset_password", { after: { sessionsEnded } }));
  });
  return result.ok ? { ok: true, temporaryPassword: password } : result;
}

/**
 * Signs a staff member out everywhere, for example when they leave (alongside revoking their
 * roles and removing them from the Cloudflare Access allow-list). Unchanged if they had none.
 */
export async function revokeSessions(db: DbOrTx, c: Change): Promise<StaffChangeResult> {
  return change(db, c, async (tx) => {
    const sessionsEnded = await endSessions(tx, c.userId);
    if (sessionsEnded === 0) throw new Refused("unchanged");
    await audit.write(tx, entry(c, "revoke_sessions", { after: { sessionsEnded } }));
  });
}
