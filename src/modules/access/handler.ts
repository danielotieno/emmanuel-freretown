import { eq } from "drizzle-orm";
import { safeQuery, type Database, type Transaction } from "../../db";
import { user as userTable } from "../../db/schema/auth";
import * as audit from "../audit";
import { createAuth, type AuthConfig } from "./auth";

const BASE_PATH = "/api/auth";

async function twoFactorEnabled(db: Transaction, userId: string): Promise<boolean> {
  const rows = await safeQuery(() =>
    db
      .select({ enabled: userTable.twoFactorEnabled })
      .from(userTable)
      .where(eq(userTable.id, userId)),
  );
  return rows[0]?.enabled === true;
}

/**
 * Serves one request to Better Auth's endpoints (the allowed ones are in auth.ts).
 *
 * Setting up the authenticator app changes the staff user's record, so it is audited
 * (`staff_user.enable_second_factor`) in the same transaction as Better Auth's own writes
 * (CLAUDE.md rule 4): Better Auth runs on the transaction, and if the entry can't be written the
 * whole set-up is undone. Sessions (sign-in, sign-out, timeouts) are not audited: like OTP
 * challenges they are short-lived and change no record (domain-model.md §3, audit).
 */
export async function handleAuthRequest(
  db: Database,
  config: Omit<AuthConfig, "db">,
  request: Request,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path !== `${BASE_PATH}/two-factor/verify-totp`) {
    return createAuth({ db, ...config }).handler(request);
  }

  return db.transaction(async (tx) => {
    const auth = createAuth({ db: tx as unknown as Database, ...config });
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
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    }
    return response;
  });
}
