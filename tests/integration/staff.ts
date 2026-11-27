import { createHmac } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";
import { expect } from "vitest";
import type { Database, Transaction } from "../../src/db";
import {
  createAuth,
  handleAuthRequest,
  StaffAccessError,
  type AccessJwtPolicy,
  type StaffRefusal,
  type StaffRole,
} from "../../src/modules/access";

// Shared by the staff integration tests (staff-auth.test.ts, staff-accounts.test.ts): a browser
// for Better Auth's real HTTP handler, authenticator codes, and synthetic staff users created
// as the owner. Every test runs in a rolled-back transaction; all people and addresses are
// synthetic.

export const ORIGIN = "https://admin.ackemmanuelfreretown.org";
export const HOST = "admin.ackemmanuelfreretown.org";
export const SECRET = "integration-test-auth-secret-0123456789abcdef";
export const PASSWORD = "correct horse battery staple";
export const SKIP: AccessJwtPolicy = { mode: "skip" };
export const MINUTE = 60_000;

export async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

export async function asOwner<T>(tx: Transaction, fn: () => Promise<T>): Promise<T> {
  await tx.execute(sql`RESET ROLE`);
  try {
    return await fn();
  } finally {
    await asApp(tx);
  }
}

/** A browser for the admin host: keeps cookies between requests to Better Auth's handler. */
export class Browser {
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
export function totp(totpURI: string, at = Date.now()): string {
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
export async function staffUser(
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
export async function enrolled(tx: Transaction, roles: StaffRole[]) {
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

export async function refusal(promise: Promise<unknown>): Promise<StaffRefusal | "allowed"> {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    if (error instanceof StaffAccessError) return error.reason;
    throw error;
  }
}

export async function sessionCount(tx: Transaction, userId: string): Promise<number> {
  return asOwner(tx, async () => {
    const { rows } = await tx.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM session WHERE user_id = ${userId}`,
    );
    return rows[0]!.n;
  });
}
