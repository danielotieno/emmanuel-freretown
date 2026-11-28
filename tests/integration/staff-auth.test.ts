import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirstSuperAdmin } from "../../scripts/staff-bootstrap";
import { schema, type Transaction } from "../../src/db";
import {
  requireEnrollingStaff,
  requireStaff,
  type AccessJwtPolicy,
  type StaffRole,
} from "../../src/modules/access";
import { rolledBack } from "./db";
import { testDatabaseUrl } from "./env";
import {
  asApp,
  asOwner,
  Browser,
  enrolled,
  MINUTE,
  PASSWORD,
  refusal,
  sessionCount,
  staffUser,
  totp,
} from "./staff";

// Staff authentication and authorisation (issue #17, FR-10, NFR-8) through Better Auth's real
// HTTP handler, against real Postgres, as app_runtime. Each test runs in a rolled-back
// transaction. All people and addresses are synthetic.

const client = new Client({ connectionString: testDatabaseUrl() });
const db = drizzle(client, { schema });
beforeAll(() => client.connect());
afterAll(() => client.end());

describe("bootstrap: the first Super Administrator", () => {
  it("creates the user, their password login and a GLOBAL grant, with audit entries", async () => {
    await rolledBack(db, async (tx) => {
      const id = await createFirstSuperAdmin(client, {
        email: " First.Admin@Example.org ",
        name: "First Admin",
        password: PASSWORD,
      });
      const { rows } = await tx.execute<{ email: string; role: string; actions: string[] }>(sql`
        SELECT u.email, r.role,
               (SELECT array_agg(action ORDER BY action) FROM audit_entry WHERE entity_id = u.id) AS actions
          FROM "user" u JOIN role_assignment r ON r.user_id = u.id WHERE u.id = ${id}`);
      expect(rows[0]).toEqual({
        email: "first.admin@example.org",
        role: "SUPER_ADMIN",
        actions: ["staff_user.create", "staff_user.grant_role"],
      });

      // They can sign in with that password, and must then set up the authenticator app.
      await asApp(tx);
      const browser = new Browser(tx);
      const signIn = await browser.post("/sign-in/email", {
        email: "first.admin@example.org",
        password: PASSWORD,
      });
      expect(signIn.status).toBe(200);
      expect(await refusal(requireStaff(browser.request(), null))).toBe("second_factor_required");
    });
  });

  it("refuses when a Super Administrator already exists", async () => {
    await rolledBack(db, async () => {
      await createFirstSuperAdmin(client, {
        email: "a@example.org",
        name: "A",
        password: PASSWORD,
      });
      await expect(
        createFirstSuperAdmin(client, { email: "b@example.org", name: "B", password: PASSWORD }),
      ).rejects.toThrow(/already exists/);
    });
  });

  it("refuses a short password or a malformed email", async () => {
    await rolledBack(db, async () => {
      await expect(
        createFirstSuperAdmin(client, { email: "a@example.org", name: "A", password: "short" }),
      ).rejects.toThrow(/at least 12/);
      await expect(
        createFirstSuperAdmin(client, { email: "nope", name: "A", password: PASSWORD }),
      ).rejects.toThrow(/email/);
    });
  });
});

describe("sign-in and the second factor", () => {
  it("allows only the enrolment page until an authenticator app is set up", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const user = await staffUser(tx, ["MEMBERSHIP_ADMIN"]);
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });

      expect(await refusal(requireStaff(browser.request(), null))).toBe("second_factor_required");
      expect(await requireEnrollingStaff(browser.request())).toEqual({
        userId: user.id,
        name: "Test Staff",
      });
    });
  });

  it("then asks for a code at every sign-in, and only the code creates a session", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { user, totpURI } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);

      const browser = new Browser(tx);
      const signIn = await browser.post("/sign-in/email", {
        email: user.email,
        password: PASSWORD,
      });
      expect(signIn.data.twoFactorRedirect).toBe(true);
      expect(await refusal(requireStaff(browser.request(), null))).toBe("signed_out");

      expect((await browser.post("/two-factor/verify-totp", { code: "000000" })).status).toBe(401);
      expect((await browser.post("/two-factor/verify-totp", { code: totp(totpURI) })).status).toBe(
        200,
      );
      const staff = await requireStaff(browser.request(), "MEMBERSHIP_ADMIN");
      expect(staff.userId).toBe(user.id);
      expect(await requireEnrollingStaff(browser.request())).toBeNull();
    });
  });

  it("audits setting up the authenticator app, once, with the staff member as actor", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { user, totpURI } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      // A later sign-in with a code changes no record and adds no entry.
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });
      await browser.post("/two-factor/verify-totp", { code: totp(totpURI) });

      const { rows } = await asOwner(tx, () =>
        tx.execute<{ action: string; actor_type: string; actor_id: string }>(sql`
          SELECT action, actor_type, actor_id FROM audit_entry
           WHERE entity_type = 'staff_user' AND entity_id = ${user.id}`),
      );
      expect(rows).toEqual([
        { action: "staff_user.enable_second_factor", actor_type: "STAFF", actor_id: user.id },
      ]);
    });
  });

  it("accepts a backup code once instead of the app's code, and audits its use", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { user, backupCodes } = await enrolled(tx, ["REGISTRATION_OFFICER"]);
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });
      const result = await browser.post("/two-factor/verify-backup-code", { code: backupCodes[0] });
      expect(result.status).toBe(200);
      expect((await requireStaff(browser.request(), "REGISTRATION_OFFICER")).userId).toBe(user.id);

      // The same code never works twice, and a failed attempt writes nothing.
      const again = new Browser(tx);
      await again.post("/sign-in/email", { email: user.email, password: PASSWORD });
      expect(
        (await again.post("/two-factor/verify-backup-code", { code: backupCodes[0] })).status,
      ).toBe(401);

      const { rows } = await asOwner(tx, () =>
        tx.execute<{ action: string; actor_id: string }>(sql`
          SELECT action, actor_id FROM audit_entry
           WHERE entity_type = 'staff_user' AND entity_id = ${user.id} ORDER BY id`),
      );
      expect(rows).toEqual([
        { action: "staff_user.enable_second_factor", actor_id: user.id },
        { action: "staff_user.use_backup_code", actor_id: user.id },
      ]);
    });
  });

  it("never trusts a device to skip the second factor", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { user, totpURI } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });
      const result = await browser.post("/two-factor/verify-totp", {
        code: totp(totpURI),
        trustDevice: true,
      });
      expect(result.status).toBe(400);
      expect([...browser.cookies.keys()].some((name) => name.includes("trust_device"))).toBe(false);
    });
  });

  it("ends a password-only session from before the authenticator app was set up", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const user = await staffUser(tx, ["MEMBERSHIP_ADMIN"]);
      const laptop = new Browser(tx);
      await laptop.post("/sign-in/email", { email: user.email, password: PASSWORD });

      // Set up on another device.
      const phone = new Browser(tx);
      await phone.post("/sign-in/email", { email: user.email, password: PASSWORD });
      const setup = await phone.post("/two-factor/enable", { password: PASSWORD });
      await phone.post("/two-factor/verify-totp", { code: totp(setup.data.totpURI as string) });

      expect(await refusal(requireStaff(laptop.request(), null))).toBe("signed_out");
      expect((await requireStaff(phone.request(), null)).userId).toBe(user.id);
      expect(await sessionCount(tx, user.id)).toBe(1);
    });
  });

  it("refuses SMS or email codes as a second factor", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const user = await staffUser(tx, ["MEMBERSHIP_ADMIN"]);
      const browser = new Browser(tx);
      await browser.post("/sign-in/email", { email: user.email, password: PASSWORD });
      expect(
        (await browser.post("/two-factor/enable", { password: PASSWORD, method: "otp" })).status,
      ).toBe(400);
      expect((await browser.post("/two-factor/send-otp")).status).toBe(404);
    });
  });

  it("answers 404 for every endpoint the staff portal doesn't use", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const browser = new Browser(tx);
      for (const path of [
        "/sign-up/email",
        "/request-password-reset",
        "/reset-password",
        "/change-email",
        "/update-user",
        "/delete-user",
        "/two-factor/disable",
        "/revoke-sessions",
      ]) {
        expect((await browser.post(path, { email: "x@example.org" })).status, path).toBe(404);
      }
    });
  });

  it("sets only __Host- cookies: Secure, Path=/, no Domain", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      expect(browser.setCookies.length).toBeGreaterThan(0);
      for (const line of browser.setCookies) {
        expect(line).toMatch(/^__Host-ack-staff\./);
        expect(line).toMatch(/; Secure/i);
        expect(line).toMatch(/; Path=\//i);
        expect(line).not.toMatch(/; Domain=/i);
        expect(line).toMatch(/; HttpOnly/i);
      }
    });
  });

  it("signs out by deleting the session", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, user } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      const stolen = new Headers(browser.headers());
      expect((await browser.post("/sign-out")).status).toBe(200);
      expect(await sessionCount(tx, user.id)).toBe(0);
      const replay = { ...browser.request(), headers: stolen };
      expect(await refusal(requireStaff(replay, null))).toBe("signed_out");
    });
  });
});

describe("rate limits (stored in the database)", () => {
  it("refuses a fourth sign-in attempt from one IP within ten seconds", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const browser = new Browser(tx, "203.0.113.99");
      const statuses = [];
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (
            await browser.post("/sign-in/email", {
              email: "no@example.org",
              password: "wrong-password-x",
            })
          ).status,
        );
      }
      expect(statuses).toEqual([401, 401, 401, 429]);
      const { rows } = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM staff_rate_limit`,
      );
      expect(rows[0]!.n).toBeGreaterThan(0);
    });
  });
});

describe("idle timeouts (D32)", () => {
  async function lastActive(tx: Transaction, userId: string): Promise<Date> {
    return asOwner(tx, async () => {
      const { rows } = await tx.execute<{ at: string }>(
        sql`SELECT updated_at AS at FROM session WHERE user_id = ${userId}`,
      );
      return new Date(rows[0]!.at);
    });
  }

  it("signs out a Membership Administrator after 30 idle minutes and revokes the session", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, user } = await enrolled(tx, ["MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"]);
      const start = await lastActive(tx, user.id);

      const at29 = new Date(start.getTime() + 29 * MINUTE);
      expect((await requireStaff(browser.request({ now: at29 }), null)).userId).toBe(user.id);
      // That request counted as activity, so the clock restarts from it.
      const at58 = new Date(at29.getTime() + 29 * MINUTE);
      expect((await requireStaff(browser.request({ now: at58 }), null)).userId).toBe(user.id);

      const at89 = new Date(at58.getTime() + 31 * MINUTE);
      expect(await refusal(requireStaff(browser.request({ now: at89 }), null))).toBe(
        "idle_timeout",
      );
      expect(await sessionCount(tx, user.id)).toBe(0);
    });
  });

  it("gives a Registration Officer alone 4 hours", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, user } = await enrolled(tx, ["REGISTRATION_OFFICER"]);
      const start = await lastActive(tx, user.id);
      const after3h59 = new Date(start.getTime() + 239 * MINUTE);
      expect((await requireStaff(browser.request({ now: after3h59 }), null)).userId).toBe(user.id);
      const later = new Date(after3h59.getTime() + 241 * MINUTE);
      expect(await refusal(requireStaff(browser.request({ now: later }), null))).toBe(
        "idle_timeout",
      );
    });
  });
});

describe("requireStaff: authorisation for every role/action pair (NFR-8)", () => {
  const ROLES: StaffRole[] = ["SUPER_ADMIN", "MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"];
  const MAY: Record<StaffRole, StaffRole[]> = {
    SUPER_ADMIN: ["SUPER_ADMIN", "MEMBERSHIP_ADMIN"],
    MEMBERSHIP_ADMIN: ["MEMBERSHIP_ADMIN"],
    REGISTRATION_OFFICER: ["REGISTRATION_OFFICER"],
  };

  for (const held of ROLES) {
    it(`${held}: ${MAY[held].join(", ")} and any-staff pages, nothing else`, async () => {
      await rolledBack(db, async (tx) => {
        await asApp(tx);
        const { browser } = await enrolled(tx, [held]);
        expect(await refusal(requireStaff(browser.request(), null))).toBe("allowed");
        for (const needed of ROLES) {
          const expected = MAY[held].includes(needed) ? "allowed" : "forbidden";
          expect(await refusal(requireStaff(browser.request(), needed)), needed).toBe(expected);
        }
        // Corrections (FR-5, #21): a Registration Officer or a Membership Administrator.
        expect(
          await refusal(
            requireStaff(browser.request(), ["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"]),
          ),
          "corrections",
        ).toBe("allowed");
      });
    });
  }

  it("a list of one role is that role: a Super Administrator is not a Registration Officer", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser } = await enrolled(tx, ["SUPER_ADMIN"]);
      expect(await refusal(requireStaff(browser.request(), ["REGISTRATION_OFFICER"]))).toBe(
        "forbidden",
      );
    });
  });

  it("refuses a staff user whose roles have all been revoked", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser, user } = await enrolled(tx, ["MEMBERSHIP_ADMIN"]);
      await tx.execute(
        sql`UPDATE role_assignment SET revoked_at = now() WHERE user_id = ${user.id}`,
      );
      expect(await refusal(requireStaff(browser.request(), null))).toBe("forbidden");
    });
  });

  it("refuses a valid session presented to the public host (e.g. a server action posted there)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser } = await enrolled(tx, ["SUPER_ADMIN"]);
      for (const host of ["ackemmanuelfreretown.org", "staging.ackemmanuelfreretown.org", ""]) {
        expect(await refusal(requireStaff(browser.request({ host }), null)), host).toBe(
          "wrong_host",
        );
      }
    });
  });

  it("refuses without a valid Cloudflare Access JWT where Access is required", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { browser } = await enrolled(tx, ["SUPER_ADMIN"]);
      const verify: AccessJwtPolicy = {
        mode: "verify",
        teamDomain: "ack-emmanuel.cloudflareaccess.com",
        audience: "aud",
        fetch: (async () => new Response(JSON.stringify({ keys: [] }))) as never,
      };
      expect(await refusal(requireStaff(browser.request({ access: verify }), null))).toBe(
        "access_denied",
      );
      expect(
        await refusal(requireStaff(browser.request({ access: { mode: "refuse" } }), null)),
      ).toBe("access_denied");
    });
  });

  it("refuses a request with no session at all", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(await refusal(requireStaff(new Browser(tx).request(), null))).toBe("signed_out");
    });
  });
});
