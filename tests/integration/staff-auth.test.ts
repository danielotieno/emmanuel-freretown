import { createHmac } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFirstSuperAdmin } from "../../scripts/staff-bootstrap";
import { schema, type Database, type Transaction } from "../../src/db";
import {
  createAuth,
  handleAuthRequest,
  requireEnrollingStaff,
  requireStaff,
  StaffAccessError,
  type AccessJwtPolicy,
  type StaffRefusal,
  type StaffRole,
} from "../../src/modules/access";
import { rolledBack } from "./db";
import { testDatabaseUrl } from "./env";

// Staff authentication and authorisation (issue #17, FR-10, NFR-8) through Better Auth's real
// HTTP handler, against real Postgres, as app_runtime. Each test runs in a rolled-back
// transaction. All people and addresses are synthetic.

const client = new Client({ connectionString: testDatabaseUrl() });
const db = drizzle(client, { schema });
beforeAll(() => client.connect());
afterAll(() => client.end());

const ORIGIN = "https://admin.ackemmanuelfreretown.org";
const HOST = "admin.ackemmanuelfreretown.org";
const SECRET = "integration-test-auth-secret-0123456789abcdef";
const PASSWORD = "correct horse battery staple";
const SKIP: AccessJwtPolicy = { mode: "skip" };
const MINUTE = 60_000;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner<T>(tx: Transaction, fn: () => Promise<T>): Promise<T> {
  await tx.execute(sql`RESET ROLE`);
  try {
    return await fn();
  } finally {
    await asApp(tx);
  }
}

/** A browser for the admin host: keeps cookies between requests to Better Auth's handler. */
class Browser {
  readonly cookies = new Map<string, string>();
  readonly setCookies: string[] = [];
  constructor(
    private readonly tx: Transaction,
    private readonly ip = "198.51.100.17",
  ) {}

  get auth() {
    return createAuth({ db: this.tx as unknown as Database, secret: SECRET, baseURL: ORIGIN });
  }

  headers(host = HOST): Headers {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    return new Headers({ host, cookie, "cf-connecting-ip": this.ip });
  }

  async post(path: string, body: Record<string, unknown> = {}) {
    const headers = this.headers();
    headers.set("origin", ORIGIN);
    headers.set("content-type", "application/json");
    const response = await handleAuthRequest(
      this.tx as unknown as Database,
      { secret: SECRET, baseURL: ORIGIN },
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      this.setCookies.push(line);
      const [pair] = line.split(";");
      const at = pair!.indexOf("=");
      const name = pair!.slice(0, at);
      const value = pair!.slice(at + 1);
      if (!value || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, data };
  }

  request(opts: { now?: Date; host?: string; access?: AccessJwtPolicy } = {}) {
    return {
      db: this.tx as unknown as Database,
      auth: this.auth,
      headers: this.headers(opts.host),
      access: opts.access ?? SKIP,
      now: opts.now,
    };
  }
}

function base32Decode(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The current code an authenticator app would show for this otpauth:// URI (RFC 6238). */
function totp(totpURI: string, at = Date.now()): string {
  const key = base32Decode(new URL(totpURI).searchParams.get("secret")!);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  const value = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

let emailCounter = 0;

/** A staff user with a password and the given roles, created as the owner. */
async function staffUser(
  tx: Transaction,
  roles: StaffRole[],
): Promise<{ email: string; id: string }> {
  emailCounter++;
  const email = `staff${emailCounter}@example.org`;
  const id = `test-user-${emailCounter}`;
  const hash = await hashPassword(PASSWORD);
  await asOwner(tx, async () => {
    await tx.execute(
      sql`INSERT INTO "user" (id, name, email) VALUES (${id}, 'Test Staff', ${email})`,
    );
    await tx.execute(sql`INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
                         VALUES (${`acct-${id}`}, ${id}, 'credential', ${id}, ${hash}, now())`);
    for (const role of roles) {
      await tx.execute(sql`INSERT INTO role_assignment (user_id, role, granted_by_user_id)
                           VALUES (${id}, ${role}, ${id})`);
    }
  });
  return { email, id };
}

/** Signs in with a password, sets up the authenticator app, and returns the browser and URI. */
async function enrolled(tx: Transaction, roles: StaffRole[]) {
  const user = await staffUser(tx, roles);
  const browser = new Browser(tx);
  expect(
    (await browser.post("/sign-in/email", { email: user.email, password: PASSWORD })).status,
  ).toBe(200);
  const setup = await browser.post("/two-factor/enable", { password: PASSWORD });
  const totpURI = setup.data.totpURI as string;
  expect((await browser.post("/two-factor/verify-totp", { code: totp(totpURI) })).status).toBe(200);
  return { browser, user, totpURI, backupCodes: setup.data.backupCodes as string[] };
}

async function refusal(promise: Promise<unknown>): Promise<StaffRefusal | "allowed"> {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    if (error instanceof StaffAccessError) return error.reason;
    throw error;
  }
}

async function sessionCount(tx: Transaction, userId: string): Promise<number> {
  return asOwner(tx, async () => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM session WHERE user_id = ${userId}`,
    );
    return rows[0]!.n;
  });
}

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
