import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import {
  changeOwnPassword,
  createStaffUser,
  grantRole,
  listStaff,
  requireEnrollingStaff,
  requirePasswordChange,
  requireStaff,
  resetPassword,
  resetSecondFactor,
  revokeRole,
  revokeSessions,
  type StaffRole,
} from "../../src/modules/access";
import { connectTestDrizzle, rolledBack } from "./db";
import {
  asApp,
  asOwner,
  Browser,
  enrolled,
  PASSWORD,
  refusal,
  sessionCount,
  staffUser,
  totp,
} from "./staff";

// Staff account management by Super Administrators (#91, FR-10), against real Postgres as
// app_runtime, through Better Auth's real handler for signing in. Each test runs in a
// rolled-back transaction. All people and addresses are synthetic.

const db = connectTestDrizzle();
const NEW_PASSWORD = "a brand new passphrase for testing";

/** A Super Administrator to act as. */
async function superAdmin(tx: Transaction) {
  const { id } = await staffUser(tx, ["SUPER_ADMIN"]);
  return { type: "STAFF" as const, userId: id };
}

async function entries(tx: Transaction, userId: string) {
  return asOwner(tx, async () => {
    const { rows } = await tx.execute<{
      action: string;
      actor_id: string;
      before: unknown;
      after: unknown;
    }>(sql`SELECT action, actor_id, before, after FROM audit_entry
            WHERE entity_type = 'staff_user' AND entity_id = ${userId} ORDER BY id`);
    return rows;
  });
}

/** Creates a staff user through the module and signs them in with the temporary password. */
async function newStaff(tx: Transaction, roles: StaffRole[] = ["MEMBERSHIP_ADMIN"]) {
  const actor = await superAdmin(tx);
  const email = `new-${crypto.randomUUID()}@example.org`;
  const created = await createStaffUser(tx, { name: "  New   Staff ", email, roles, actor });
  if (!created.ok) throw new Error(created.reason);
  const browser = new Browser(tx);
  const signIn = await browser.post("/sign-in/email", {
    email: email.toUpperCase(),
    password: created.temporaryPassword,
  });
  expect(signIn.status).toBe(200);
  return { actor, email, browser, ...created };
}

describe("creating a staff user (FR-10: no self sign-up)", () => {
  it("creates the account, its roles and a temporary password, with audit entries", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { actor, userId, temporaryPassword } = await newStaff(tx, [
        "MEMBERSHIP_ADMIN",
        "REGISTRATION_OFFICER",
      ]);
      expect(temporaryPassword).toMatch(/^[a-zA-Z2-9]{4}(-[a-zA-Z2-9]{4}){3}$/);

      const [account] = await listStaff(tx, userId);
      expect(account).toMatchObject({
        name: "New Staff",
        roles: ["MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"],
        hasAuthenticator: false,
        mustChangePassword: true,
        openSessions: 1,
      });
      expect(account!.email).toMatch(/^new-.*@example\.org$/);
      expect(await entries(tx, userId)).toEqual([
        {
          action: "staff_user.create",
          actor_id: actor.userId,
          before: null,
          after: { source: "staff_portal" },
        },
        {
          action: "staff_user.grant_role",
          actor_id: actor.userId,
          before: null,
          after: { role: "MEMBERSHIP_ADMIN", scope: "GLOBAL" },
        },
        {
          action: "staff_user.grant_role",
          actor_id: actor.userId,
          before: null,
          after: { role: "REGISTRATION_OFFICER", scope: "GLOBAL" },
        },
      ]);
    });
  });

  it("refuses an email address already in use, ignoring capitals, and bad input", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const input = { name: "A Staff", email: "Same@Example.org", roles: ["SUPER_ADMIN"], actor };
      expect((await createStaffUser(tx, input)).ok).toBe(true);
      expect(await createStaffUser(tx, { ...input, email: "same@example.ORG" })).toEqual({
        ok: false,
        reason: "email_taken",
      });
      expect(
        await createStaffUser(tx, { name: " ", email: "nope", roles: ["OWNER"], actor }),
      ).toEqual({
        ok: false,
        reason: "invalid",
        errors: { name: "required", email: "invalid", roles: "required" },
      });
    });
  });
});

describe("the temporary password (#91)", () => {
  it("must be replaced before anything else, then the authenticator app is set up", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, email, userId, temporaryPassword } = await newStaff(tx);
      expect(await refusal(requireStaff(browser.request(), null))).toBe("password_change_required");
      expect(await refusal(requireEnrollingStaff(browser.request()))).toBe(
        "password_change_required",
      );
      const staff = await requirePasswordChange(browser.request());
      expect(staff).toMatchObject({ userId, forced: true });

      const change = (currentPassword: string, newPassword: string) =>
        changeOwnPassword(tx, { userId, sessionId: staff.sessionId, currentPassword, newPassword });
      expect(await change("not the password", NEW_PASSWORD)).toEqual({
        ok: false,
        reason: "wrong_password",
      });
      expect(await change(temporaryPassword, "too short")).toEqual({
        ok: false,
        reason: "too_short",
      });
      expect(await change(temporaryPassword, temporaryPassword)).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await change(temporaryPassword, NEW_PASSWORD)).toEqual({ ok: true });

      // The same session carries on, to set up the authenticator app.
      expect(await refusal(requireStaff(browser.request(), null))).toBe("second_factor_required");
      expect(await requireEnrollingStaff(browser.request())).toEqual({ userId, name: "New Staff" });
      const [account] = await listStaff(tx, userId);
      expect(account!.mustChangePassword).toBe(false);

      const old = await new Browser(tx).post("/sign-in/email", {
        email,
        password: temporaryPassword,
      });
      expect(old.status).toBe(401);
      const fresh = await new Browser(tx).post("/sign-in/email", {
        email,
        password: NEW_PASSWORD,
      });
      expect(fresh.status).toBe(200);

      const changed = (await entries(tx, userId)).filter(
        (e) => e.action === "staff_user.change_password",
      );
      expect(changed).toEqual([
        {
          action: "staff_user.change_password",
          actor_id: userId,
          before: null,
          after: { sessionsEnded: 0 },
        },
      ]);
    });
  });

  it("is open to any signed-in staff member, and signs out their other sessions", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, user, totpURI } = await enrolled(tx, ["REGISTRATION_OFFICER"]);
      const other = new Browser(tx, "198.51.100.99");
      await other.post("/sign-in/email", { email: user.email, password: PASSWORD });
      await other.post("/two-factor/verify-totp", { code: totp(totpURI) });
      expect(await sessionCount(tx, user.id)).toBe(2);

      const staff = await requirePasswordChange(browser.request());
      expect(staff.forced).toBe(false);
      expect(
        await changeOwnPassword(tx, {
          userId: user.id,
          sessionId: staff.sessionId,
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
      ).toEqual({ ok: true });
      expect(await refusal(requireStaff(browser.request(), "REGISTRATION_OFFICER"))).toBe(
        "allowed",
      );
      expect(await refusal(requireStaff(other.request(), null))).toBe("signed_out");
    });
  });

  it("can't be changed before the authenticator app is set up, or without a role", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const user = await staffUser(tx, ["MEMBERSHIP_ADMIN"]);
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });
      expect(await refusal(requirePasswordChange(browser.request()))).toBe(
        "second_factor_required",
      );

      const { browser: ready, user: roleless } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      await tx.execute(
        sql`UPDATE role_assignment SET revoked_at = now() WHERE user_id = ${roleless.id}`,
      );
      expect(await refusal(requirePasswordChange(ready.request()))).toBe("forbidden");
    });
  });
});

describe("roles (GLOBAL in Release 1)", () => {
  it("grants and revokes, each audited, taking effect on the next request", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const { browser, user } = await enrolled(tx, ["REGISTRATION_OFFICER"]);
      const c = { userId: user.id, actor };

      expect(await grantRole(tx, { ...c, role: "MEMBERSHIP_ADMIN" })).toEqual({ ok: true });
      expect(await grantRole(tx, { ...c, role: "MEMBERSHIP_ADMIN" })).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await refusal(requireStaff(browser.request(), "MEMBERSHIP_ADMIN"))).toBe("allowed");

      expect(await revokeRole(tx, { ...c, role: "MEMBERSHIP_ADMIN" })).toEqual({ ok: true });
      expect(await revokeRole(tx, { ...c, role: "MEMBERSHIP_ADMIN" })).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await refusal(requireStaff(browser.request(), "MEMBERSHIP_ADMIN"))).toBe("forbidden");

      expect((await entries(tx, user.id)).map((e) => [e.action, e.actor_id])).toEqual([
        ["staff_user.enable_second_factor", user.id],
        ["staff_user.grant_role", actor.userId],
        ["staff_user.revoke_role", actor.userId],
      ]);
      expect((await entries(tx, user.id))[2]!.before).toEqual({
        role: "MEMBERSHIP_ADMIN",
        scope: "GLOBAL",
      });
    });
  });

  it("lets a Super Administrator grant themselves a role, but not revoke one (D59)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const self = { userId: actor.userId, actor };
      expect(await grantRole(tx, { ...self, role: "REGISTRATION_OFFICER" })).toEqual({
        ok: true,
      });
      expect(await revokeRole(tx, { ...self, role: "REGISTRATION_OFFICER" })).toEqual({
        ok: false,
        reason: "self",
      });
    });
  });

  it("keeps the last active Super Administrator (D59)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE role_assignment SET revoked_at = now() WHERE revoked_at IS NULL`),
      );
      const a = await superAdmin(tx);
      const b = await superAdmin(tx);
      expect(await revokeRole(tx, { userId: b.userId, actor: a, role: "SUPER_ADMIN" })).toEqual({
        ok: true,
      });
      // Only `a` is left. The actor's own role is checked by the caller; here anyone tries.
      expect(await revokeRole(tx, { userId: a.userId, actor: b, role: "SUPER_ADMIN" })).toEqual({
        ok: false,
        reason: "last_super_admin",
      });
    });
  });
});

describe("resetting a lost authenticator app", () => {
  it("removes it, ends every session, and audits the set-up that follows (#93 review)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const { browser, user } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);

      expect(await resetSecondFactor(tx, { userId: user.id, actor })).toEqual({ ok: true });
      expect(await sessionCount(tx, user.id)).toBe(0);
      expect(await refusal(requireStaff(browser.request(), null))).toBe("signed_out");
      const [account] = await listStaff(tx, user.id);
      expect(account!.hasAuthenticator).toBe(false);
      expect(await resetSecondFactor(tx, { userId: user.id, actor })).toEqual({
        ok: false,
        reason: "unchanged",
      });

      // The password alone now signs in, to the enrolment page only; enrolling is audited.
      const again = new Browser(tx);
      const signIn = await again.post("/sign-in/email", { email: user.email, password: PASSWORD });
      expect(signIn.data.twoFactorRedirect).toBeUndefined();
      expect(await refusal(requireStaff(again.request(), null))).toBe("second_factor_required");
      const setup = await again.post("/two-factor/enable", { password: PASSWORD });
      const code = totp(setup.data.totpURI as string);
      expect((await again.post("/two-factor/verify-totp", { code })).status).toBe(200);
      expect(await refusal(requireStaff(again.request(), "MEMBERSHIP_ADMIN"))).toBe("allowed");

      expect((await entries(tx, user.id)).map((e) => [e.action, e.actor_id, e.after])).toEqual([
        ["staff_user.enable_second_factor", user.id, { method: "authenticator_app" }],
        ["staff_user.reset_second_factor", actor.userId, { sessionsEnded: 1 }],
        ["staff_user.enable_second_factor", user.id, { method: "authenticator_app" }],
      ]);
    });
  });
});

describe("resetting a forgotten password", () => {
  it("issues a temporary password, to replace after the authenticator code", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const { user, totpURI } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);

      const reset = await resetPassword(tx, { userId: user.id, actor });
      if (!reset.ok) throw new Error(reset.reason);
      expect(await sessionCount(tx, user.id)).toBe(0);
      expect(
        (await new Browser(tx).post("/sign-in/email", { email: user.email, password: PASSWORD }))
          .status,
      ).toBe(401);

      const browser = new Browser(tx);
      const signIn = await browser.post("/sign-in/email", {
        email: user.email,
        password: reset.temporaryPassword,
      });
      expect(signIn.data.twoFactorRedirect).toBe(true);
      await browser.post("/two-factor/verify-totp", { code: totp(totpURI) });
      expect(await refusal(requireStaff(browser.request(), null))).toBe("password_change_required");
      expect((await entries(tx, user.id)).at(-1)).toMatchObject({
        action: "staff_user.reset_password",
        actor_id: actor.userId,
        after: { sessionsEnded: 1 },
      });
    });
  });
});

describe("signing a staff member out everywhere", () => {
  it("ends every session, audited; unchanged when there were none", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const { browser, user } = await enrolled(tx, ["REGISTRATION_OFFICER"]);
      expect(await revokeSessions(tx, { userId: user.id, actor })).toEqual({ ok: true });
      expect(await refusal(requireStaff(browser.request(), null))).toBe("signed_out");
      expect(await revokeSessions(tx, { userId: user.id, actor })).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect((await entries(tx, user.id)).at(-1)).toMatchObject({
        action: "staff_user.revoke_sessions",
        after: { sessionsEnded: 1 },
      });
    });
  });
});

describe("safeguards on every change (D59)", () => {
  it("refuses a Super Administrator's own account, and an unknown one", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const actor = await superAdmin(tx);
      const self = { userId: actor.userId, actor };
      const unknown = { userId: "no-such-staff-user", actor };
      for (const run of [resetSecondFactor, revokeSessions, resetPassword]) {
        expect(await run(tx, self), run.name).toEqual({ ok: false, reason: "self" });
        expect(await run(tx, unknown), run.name).toEqual({ ok: false, reason: "not_found" });
      }
      expect(await grantRole(tx, { ...unknown, role: "SUPER_ADMIN" })).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await entries(tx, actor.userId)).toEqual([]);
    });
  });
});

describe("the Cloudflare Access identity (#91 review)", () => {
  it("refuses signing in as anyone but the person Access checked, as a wrong password", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const mine = await staffUser(tx, ["SUPER_ADMIN"]);
      const theirs = await staffUser(tx, ["MEMBERSHIP_ADMIN"]);
      const browser = new Browser(tx);
      browser.access = { status: "verified", email: mine.email };
      const other = await browser.post("/sign-in/email", {
        email: theirs.email,
        password: PASSWORD,
      });
      expect(other).toEqual({
        status: 401,
        data: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      });
      expect(await sessionCount(tx, theirs.id)).toBe(0);
      const own = await browser.post("/sign-in/email", {
        email: mine.email.toUpperCase(),
        password: PASSWORD,
      });
      expect(own.status).toBe(200);
    });
  });

  it("ends a session used from behind someone else's Access login", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      // A Super Administrator who reset another account and read its temporary password, then
      // signed in as them where Access isn't checked: their own Access login doesn't match.
      const { browser, user } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      expect(
        await refusal(
          requireStaff(await browser.requestThroughAccess(user.email.toUpperCase()), null),
        ),
      ).toBe("allowed");
      expect(
        await refusal(requireStaff(await browser.requestThroughAccess("other@example.org"), null)),
      ).toBe("identity_mismatch");
      expect(await sessionCount(tx, user.id)).toBe(0);
    });
  });

  it("refuses a token without an email, such as a service token", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser } = await enrolled(tx, ["SUPER_ADMIN"]);
      expect(await refusal(requireStaff(await browser.requestThroughAccess(null), null))).toBe(
        "identity_mismatch",
      );
    });
  });
});
