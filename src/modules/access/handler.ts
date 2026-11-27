import { eq } from "drizzle-orm";
import { safeQuery, type Database, type Transaction } from "../../db";
import { user as userTable } from "../../db/schema/auth";
import * as audit from "../audit";
import { createAuth, type AuthConfig } from "./auth";
import { isAccessIdentity, type AccessResult } from "./cloudflare-access";

const BASE_PATH = "/api/auth";
const SIGN_IN = `${BASE_PATH}/sign-in/email`;
const VERIFY_TOTP = `${BASE_PATH}/two-factor/verify-totp`;
const VERIFY_BACKUP_CODE = `${BASE_PATH}/two-factor/verify-backup-code`;

async function twoFactorEnabled(db: Transaction, userId: string): Promise<boolean> {
  const rows = await safeQuery(() =>
    db
      .select({ enabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, userId)),
  );
  return rows[0]?.enabled === true;
}

/** The email a sign-in request names, or "" if it names none. */
async function signInEmail(request: Request): Promise<string> {
  const body = (await request
    .clone()
    .json()
    .catch(() => null)) as { email?: unknown } | null;
  return typeof body?.email === "string" ? body.email : "";
}

/** The staff user id in a successful verify response (`{ token, user: { id } }`). */
async function verifiedUserId(response: Response): Promise<string | null> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { user?: { id?: unknown } } | null;
  return typeof body?.user?.id === "string" ? body.user.id : null;
}

/**
 * Serves one request to Better Auth's endpoints (the allowed ones are in auth.ts).
 *
 * Two of them change the staff user's own credentials, so they are audited in the same
 * transaction as Better Auth's writes (CLAUDE.md rule 4): Better Auth runs on the transaction,
 * and if the entry can't be written the whole change is undone.
 * - `/two-factor/verify-totp` that completes setting up the authenticator app:
 *   `staff_user.enable_second_factor`.
 * - `/two-factor/verify-backup-code`, which uses up one backup code:
 *   `staff_user.use_backup_code`. A backup code in use is the sign of a lost phone or worse,
 *   so Super Administrators need to see it.
 * Sessions (sign-in, sign-out, timeouts) are not audited: like OTP challenges they are
 * short-lived and change no record (domain-model.md §3, audit).
 *
 * Signing in is refused, with Better Auth's own answer to a wrong password, for any email but
 * the one Cloudflare Access checked (`access`, #91): nobody signs in as someone else from
 * behind their own Access login, even knowing that person's password.
 */
export async function handleAuthRequest(
  db: Database,
  config: Omit<AuthConfig, "db">,
  request: Request,
  access: AccessResult,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === SIGN_IN && !isAccessIdentity(access, await signInEmail(request))) {
    return Response.json(
      { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      { status: 401 },
    );
  }
  if (path !== VERIFY_TOTP && path !== VERIFY_BACKUP_CODE) {
    return createAuth({ db, ...config }).handler(request);
  }

  return db.transaction(async (tx) => {
    const auth = createAuth({ db: tx as unknown as Database, ...config });
    const requestId = request.headers.get("x-request-id") ?? undefined;

    if (path === VERIFY_BACKUP_CODE) {
      const response = await auth.handler(request);
      const userId = response.ok ? await verifiedUserId(response) : null;
      if (userId) {
        await audit.write(tx, {
          actor: { type: "STAFF", userId },
          action: "staff_user.use_backup_code",
          entityType: "staff_user",
          entityId: userId,
          requestId,
        });
      }
      return response;
    }

    // A session exists only while setting up; at sign-in the code comes before the session.
    const before = await auth.api.getSession({ headers: request.headers });
    const enrolling = before && !(await twoFactorEnabled(tx, before.user.id));
    const response = await auth.handler(request);
    if (enrolling && response.ok && (await twoFactorEnabled(tx, before.user.id))) {
      await audit.write(tx, {
        actor: { type: "STAFF", userId: before.user.id },
        action: "staff_user.enable_second_factor",
        entityType: "staff_user",
        entityId: before.user.id,
        after: { method: "authenticator_app" },
        requestId,
      });
    }
    return response;
  });
}
