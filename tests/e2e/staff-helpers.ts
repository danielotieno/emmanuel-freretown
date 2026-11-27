import { createHmac, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, type BrowserContext, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import en from "../../messages/en.json" with { type: "json" };

// Shared by the staff-portal journeys (desk.spec.ts, review.spec.ts): synthetic staff users
// created in the e2e database with the owner's credentials (DATABASE_URL), signing in and
// setting up an authenticator app through the real pages, and filling in the officer desk.

// Every step is a server round trip, and signing in several: seconds against a remote test
// database, milliseconds in CI and production.
export const expect = baseExpect.configure({ timeout: 30_000 });

try {
  process.loadEnvFile(".env");
} catch {
  // CI sets DATABASE_URL directly.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const ADMIN = `http://admin.localhost:${PORT}`;
const PASSWORD = "correct horse battery staple";
export const EVENT = "Judea HBC AGM, 17 Jan 2027";

export function randomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
}

/**
 * For each test: Chromium only (admin.localhost resolves in Chromium alone), its own client IP
 * and English. Locally there is no Cloudflare in front, so the app trusts CF-Connecting-IP as
 * the client IP: each page gets its own, so sign-in rate limits never make reruns flaky.
 */
export async function preparePage(page: Page, context: BrowserContext): Promise<void> {
  const ip = `198.51.${randomDigits(2)}.${randomDigits(2)}`;
  await page.route(/^http:\/\/admin\.localhost(:\d+)?\//, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.addCookies([
    { name: "PARAGLIDE_LOCALE", value: "en", url: "http://admin.localhost" },
  ]);
}

function ownerClient(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (the e2e database's owner) is not set");
  return new Client({ connectionString: url });
}

/** The staff users this worker created, disabled when its tests are done. */
const created: string[] = [];

/**
 * Call from each spec's afterAll: the staff users its worker created lose every way to sign in
 * and every role. Their password is in this file. The user rows stay, as audit entries may name
 * them.
 */
export async function disableCreatedStaff(): Promise<void> {
  if (created.length === 0) return;
  const client = ownerClient();
  await client.connect();
  try {
    for (const table of ["session", "two_factor", "account"]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [created]);
    }
    await client.query(
      `UPDATE role_assignment SET revoked_at = now() WHERE user_id = ANY($1) AND revoked_at IS NULL`,
      [created],
    );
  } finally {
    await client.end();
  }
}

/** A synthetic staff user with a password and the given roles, created as the owner. */
export async function createStaff(roles: string[], name = "E2E Staff"): Promise<string> {
  const id = `e2e-${randomBytes(8).toString("hex")}`;
  const email = `${id}@example.org`;
  const client = ownerClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, $3, $2)`, [
      id,
      email,
      name,
    ]);
    await client.query(
      `INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
       VALUES ($1, $2, 'credential', $2, $3, now())`,
      [`acct-${id}`, id, await hashPassword(PASSWORD)],
    );
    for (const role of roles) {
      await client.query(
        `INSERT INTO role_assignment (user_id, role, granted_by_user_id) VALUES ($1, $2, $1)`,
        [id, role],
      );
    }
    await client.query("COMMIT");
    created.push(id);
  } finally {
    await client.end();
  }
  return email;
}

/**
 * A synthetic ACTIVE member in Judea with no personal phone, created as the owner, as if
 * imported (D47). Returns their id. The FWO number is random, so reruns never collide.
 */
export async function createMember(fullName: string): Promise<{ id: string; fwoNumber: string }> {
  const fwoNumber = `9${randomDigits(9)}`;
  const client = ownerClient();
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `WITH m AS (
         INSERT INTO member (fwo_number, full_name, language) VALUES ($1, $2, 'en') RETURNING id)
       INSERT INTO member_hbc_assignment (member_id, hbc_id)
       SELECT m.id, (SELECT id FROM hbc WHERE name = 'Judea') FROM m RETURNING member_id AS id`,
      [fwoNumber, fullName],
    );
    return { id: rows[0]!.id, fwoNumber };
  } finally {
    await client.end();
  }
}

/** The current code an authenticator app would show for a base32 setup key (RFC 6238). */
function totp(setupKey: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of setupKey.replace(/\s+/g, "").toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return ((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** Signs in through the real pages and sets up the authenticator app (FR-10). */
export async function signIn(page: Page, roles: string[], name?: string) {
  const email = await createStaff(roles, name);
  await page.goto(`${ADMIN}/sign-in`);
  // The sign-in form posts with JavaScript: a click before it hydrates would do nothing.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(`${ADMIN}/enrol`);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("p.font-mono")).toBeVisible();
  const setupKey = await page.locator("p.font-mono").innerText();
  await page.getByLabel("6-digit code").fill(totp(setupKey));
  await page.getByRole("button", { name: "Finish setting up" }).click();
  await expect(page).toHaveURL(`${ADMIN}/`);
}

export async function next(page: Page) {
  await page.getByRole("button", { name: en.reg_continue }).click();
}

/** The event and the member's details, up to the phone step. */
export async function fillMember(
  page: Page,
  member: {
    newMember?: boolean;
    hbcUnknown?: boolean;
    fullName?: string;
    eventLabel?: string;
  } = {},
) {
  await page.getByLabel(en.desk_event_title).fill(member.eventLabel ?? EVENT);
  await next(page);
  await expect(page.getByRole("heading", { name: en.desk_member_title })).toBeVisible();
  await page.getByLabel(en.desk_name_label, { exact: true }).fill(member.fullName ?? "Test Person");
  if (member.newMember) {
    await page.getByRole("checkbox", { name: en.desk_new_member_label }).check();
  } else {
    await page.getByLabel(en.desk_fwo_label, { exact: true }).fill(`9${randomDigits(5)}`);
  }
  if (member.hbcUnknown) {
    // D49: only offered to a new member, so `newMember` must be set too.
    if (!member.newMember) throw new Error("fillMember: hbcUnknown needs newMember");
    await page.getByRole("checkbox", { name: en.desk_hbc_unknown_label }).check();
  } else {
    await page.getByLabel(en.desk_hbc_label, { exact: true }).selectOption({ label: "Judea" });
  }
  await page.getByRole("checkbox", { name: "Mother's Union" }).check();
  await next(page);
  await expect(page.getByRole("heading", { name: en.desk_phone_title })).toBeVisible();
}

export async function confirmAll(page: Page) {
  await expect(page.getByRole("heading", { name: en.desk_confirm_title })).toBeVisible();
  await page.getByRole("checkbox", { name: en.desk_read_back_label }).check();
  await page.getByRole("checkbox", { name: en.desk_adult_label }).check();
  await page.getByRole("checkbox", { name: en.desk_privacy_label }).check();
  await page.getByRole("checkbox", { name: en.desk_consent_label }).check();
}

export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

/**
 * Registers a member with no personal phone at the desk (FR-3): no code and no Turnstile, so the
 * quickest way to put a registration in the review queue. The page must be signed in as an
 * officer.
 */
export async function registerAtDesk(
  page: Page,
  member: { fullName: string; eventLabel: string; fwoNumber?: boolean },
): Promise<void> {
  await page.goto(`${ADMIN}/desk`);
  await fillMember(page, member);
  await page.getByRole("radio", { name: en.desk_phone_none }).check();
  await next(page);
  await confirmAll(page);
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible();
}
