import { and, eq, inArray, isNull } from "drizzle-orm";
import { safeQuery, type Database } from "../../db";
import { roleAssignment } from "../../db/schema/access";
import { session as sessionTable, twoFactor, user as userTable } from "../../db/schema/auth";
import { isAdminHost } from "../../lib/hosts";
import { SafeError } from "../observability";
import type { Auth } from "./auth";
import { passesAccess, type AccessJwtPolicy } from "./cloudflare-access";
import {
  GLOBAL,
  idleTimeoutMs,
  isAllowed,
  type RoleGrant,
  type RoleRequirement,
  type Scope,
} from "./roles";

/**
 * Why a staff request was refused. The app turns these into redirects or a 404; none of them
 * is shown to the visitor in detail.
 * - `wrong_host`: not an admin host (for example a server action posted to the public site).
 * - `access_denied`: no valid Cloudflare Access JWT.
 * - `signed_out`: no session, or one that was revoked.
 * - `idle_timeout`: idle for longer than D32 allows; the session has been revoked.
 * - `password_change_required`: signed in with a temporary password from a Super
 *   Administrator, which they must replace first (#91).
 * - `second_factor_required`: signed in with a password but no authenticator app set up yet.
 * - `forbidden`: signed in properly, without a role that allows this.
 */
export type StaffRefusal =
  | "wrong_host"
  | "access_denied"
  | "signed_out"
  | "idle_timeout"
  | "password_change_required"
  | "second_factor_required"
  | "forbidden";

export class StaffAccessError extends SafeError {
  readonly reason: StaffRefusal;

  constructor(reason: StaffRefusal) {
    super(`staff_${reason}`, `Staff request refused: ${reason}`);
    this.name = "StaffAccessError";
    this.reason = reason;
  }
}

/** What `requireStaff` needs from the request. The app layer builds it (src/app/_lib/staff.ts). */
export interface StaffRequest {
  db: Database;
  auth: Auth;
  headers: Headers;
  access: AccessJwtPolicy;
  now?: Date;
}

/** A signed-in staff member who has passed every check. */
export interface Staff {
  userId: string;
  name: string;
  sessionId: string;
  grants: RoleGrant[];
}

/** A staff member signed in with a password who must set up an authenticator app first. */
export interface EnrollingStaff {
  userId: string;
  name: string;
}

/** Activity is recorded at most this often, so a busy page doesn't write on every request. */
const TOUCH_AFTER_MS = 60_000;

async function activeGrants(db: Database, userId: string): Promise<RoleGrant[]> {
  const rows = await safeQuery(() =>
    db
      .select({
        role: roleAssignment.role,
        scopeType: roleAssignment.scopeType,
        scopeId: roleAssignment.scopeId,
      })
      .from(roleAssignment)
      .where(and(eq(roleAssignment.userId, userId), isNull(roleAssignment.revokedAt))),
  );
  return rows.map((r) => ({
    role: r.role,
    scope: r.scopeType === "GLOBAL" ? GLOBAL : { type: r.scopeType, id: r.scopeId ?? "" },
  }));
}

async function hasAuthenticator(db: Database, userId: string): Promise<boolean> {
  const rows = await safeQuery(() =>
    db
      .select({ id: twoFactor.id })
      .from(twoFactor)
      .where(and(eq(twoFactor.userId, userId), eq(twoFactor.verified, true)))
      .limit(1),
  );
  return rows.length > 0;
}

async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await safeQuery(() => db.delete(sessionTable).where(eq(sessionTable.id, sessionId)));
}

/**
 * Where a signed-in staff member stands: ready, or with a step to take first. A temporary
 * password is replaced before anything else, then the authenticator app is set up.
 */
interface SessionState {
  state: "ready" | "password_change_required" | "enrolment_required";
  staff: Staff;
}

/**
 * Every check except the role: host, Cloudflare Access, a live session, the idle timeout and
 * the second factor. Records activity for the idle timeout.
 */
async function checkSession(req: StaffRequest): Promise<SessionState> {
  const { db, auth, headers } = req;
  const now = req.now ?? new Date();

  if (!isAdminHost(headers.get("host"))) throw new StaffAccessError("wrong_host");
  if (!(await passesAccess(headers, req.access, now))) throw new StaffAccessError("access_denied");

  const found = await auth.api.getSession({ headers });
  if (!found) throw new StaffAccessError("signed_out");
  const { session, user } = found;

  const grants = await activeGrants(db, user.id);
  const lastActive = new Date(session.updatedAt).getTime();
  if (now.getTime() - lastActive > idleTimeoutMs(grants)) {
    await revokeSession(db, session.id);
    throw new StaffAccessError("idle_timeout");
  }

  const enrolled = user.twoFactorEnabled === true && (await hasAuthenticator(db, user.id));
  if (enrolled && !session.twoFactorVerified) {
    // A password-only session from before the staff member set up their authenticator app,
    // perhaps on another device. It never proved the second factor, so it ends here.
    await revokeSession(db, session.id);
    throw new StaffAccessError("signed_out");
  }

  if (now.getTime() - lastActive > TOUCH_AFTER_MS) {
    await safeQuery(() =>
      db.update(sessionTable).set({ updatedAt: now }).where(eq(sessionTable.id, session.id)),
    );
  }

  const staff = { userId: user.id, name: user.name, sessionId: session.id, grants };
  if (user.mustChangePassword) return { state: "password_change_required", staff };
  if (!enrolled) return { state: "enrolment_required", staff };
  return { state: "ready", staff };
}

/** The refusal for a step the staff member has yet to take, if any. */
function pendingStep(result: SessionState): StaffAccessError | null {
  if (result.state === "password_change_required") {
    return new StaffAccessError("password_change_required");
  }
  if (result.state === "enrolment_required") return new StaffAccessError("second_factor_required");
  return null;
}

/**
 * The authorisation boundary for the staff portal (CLAUDE.md rule 1). Every admin page, server
 * action and route handler calls it before doing anything else. It refuses, by throwing a
 * StaffAccessError, unless the request:
 * - came to an admin host, through Cloudflare Access (its JWT is checked);
 * - carries a live session that was created after a second factor (FR-10), of a staff member
 *   who no longer holds a temporary password (#91);
 * - has not been idle for longer than D32 allows (the session is revoked if so); and
 * - belongs to a staff user with an active grant for `role` in `scope`: one role, any one of a
 *   list, or with `role` null any active grant. A Super Administrator also satisfies Membership
 *   Administrator.
 */
export async function requireStaff(
  req: StaffRequest,
  role: RoleRequirement,
  scope: Scope = GLOBAL,
): Promise<Staff> {
  const result = await checkSession(req);
  const pending = pendingStep(result);
  if (pending) throw pending;
  if (!isAllowed(result.staff.grants, role, scope)) throw new StaffAccessError("forbidden");
  return result.staff;
}

/**
 * For the enrolment page only: the staff member signed in with a password who still has to set
 * up an authenticator app. Returns null if they already have one (they belong on the staff home
 * page instead). Throws a StaffAccessError for every other refusal, including a temporary
 * password still to replace.
 */
export async function requireEnrollingStaff(req: StaffRequest): Promise<EnrollingStaff | null> {
  const result = await checkSession(req);
  if (result.state === "password_change_required") {
    throw new StaffAccessError("password_change_required");
  }
  if (result.state !== "enrolment_required") return null;
  return { userId: result.staff.userId, name: result.staff.name };
}

/**
 * For changing one's own password (#91): the staff member who must replace a temporary password
 * (`forced`), or any ready staff member with an active role. Refuses one who still has to set up
 * an authenticator app, and every other refusal `requireStaff` makes.
 */
export async function requirePasswordChange(
  req: StaffRequest,
): Promise<Staff & { forced: boolean }> {
  const result = await checkSession(req);
  if (result.state === "enrolment_required") throw new StaffAccessError("second_factor_required");
  if (result.state === "ready" && !isAllowed(result.staff.grants, null)) {
    throw new StaffAccessError("forbidden");
  }
  return { ...result.staff, forced: result.state === "password_change_required" };
}

/**
 * Staff users' names by id, for staff screens that say who captured or decided something
 * (FR-4). Names only: never an email address or anything about the account.
 */
export async function staffNames(db: Database, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await safeQuery(() =>
    db
      .select({ id: userTable.id, name: userTable.name })
      .from(userTable)
      .where(inArray(userTable.id, ids)),
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}
