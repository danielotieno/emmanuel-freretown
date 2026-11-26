import { createHmac, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { Client } from "pg";
import en from "../../messages/en.json" with { type: "json" };

// The assisted-registration journey at the officer desk (issue #18, FR-3, NFR-8). A synthetic
// Registration Officer is created in the e2e database with the owner's credentials
// (DATABASE_URL), then signs in and sets up an authenticator app through the real pages. The
// server runs in test mode (E2E_TEST_MODE): no SMS is sent and every code is 000000. Turnstile
// uses Cloudflare's always-pass test keys.
//
// Chromium only, like tests/e2e/staff.spec.ts: admin.localhost resolves in Chromium alone. The
// 360 × 800 Android project is the "mid-range Android phone" FR-3 asks for.

test.describe.configure({ timeout: 120_000 });

// Every step is a server round trip, and signing in several: seconds against a remote test
// database, milliseconds in CI and production.
const expect = baseExpect.configure({ timeout: 30_000 });

try {
  process.loadEnvFile(".env");
} catch {
  // CI sets DATABASE_URL directly.
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const ADMIN = `http://admin.localhost:${PORT}`;
const PASSWORD = "correct horse battery staple";
const TEST_CODE = "000000";
const EVENT = "Judea HBC AGM, 17 Jan 2027";

function randomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
}

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  // Locally there is no Cloudflare in front, so the app trusts CF-Connecting-IP as the client
  // IP: each test gets its own, so sign-in rate limits never make reruns flaky.
  const ip = `198.51.${randomDigits(2)}.${randomDigits(2)}`;
  await page.route(/^http:\/\/admin\.localhost(:\d+)?\//, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.addCookies([
    { name: "PARAGLIDE_LOCALE", value: "en", url: "http://admin.localhost" },
  ]);
});

function ownerClient(): Client {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (the e2e database's owner) is not set");
  return new Client({ connectionString: url });
}

/** The staff users this worker created, disabled when its tests are done. */
const created: string[] = [];

test.afterAll(async () => {
  if (created.length === 0) return;
  // Their password is in this file: take away every way to sign in, and every role. The user
  // rows stay, as audit entries may name them.
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
});

/** A synthetic staff user with a password and the given roles, created as the owner. */
async function createStaff(roles: string[]): Promise<string> {
  const id = `e2e-${randomBytes(8).toString("hex")}`;
  const email = `${id}@example.org`;
  const client = ownerClient();
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO "user" (id, name, email) VALUES ($1, 'E2E Officer', $2)`, [
      id,
      email,
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
async function signIn(page: Page, roles: string[]) {
  const email = await createStaff(roles);
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

async function next(page: Page) {
  await page.getByRole("button", { name: en.reg_continue }).click();
}

/** The event and the member's details, up to the phone step. */
async function fillMember(page: Page, member: { newMember?: boolean } = {}) {
  await page.getByLabel(en.desk_event_title).fill(EVENT);
  await page.getByRole("radio", { name: "Kiswahili" }).check();
  await next(page);
  await expect(page.getByRole("heading", { name: en.desk_member_title })).toBeVisible();
  await page.getByLabel(en.desk_name_label, { exact: true }).fill("Test Person");
  if (member.newMember) {
    await page.getByRole("checkbox", { name: en.desk_new_member_label }).check();
  } else {
    await page.getByLabel(en.desk_fwo_label, { exact: true }).fill(`9${randomDigits(5)}`);
  }
  await page.getByLabel(en.desk_hbc_label, { exact: true }).selectOption({ label: "Judea" });
  await page.getByRole("checkbox", { name: "Mother's Union" }).check();
  await next(page);
  await expect(page.getByRole("heading", { name: en.desk_phone_title })).toBeVisible();
}

async function confirmAll(page: Page) {
  await expect(page.getByRole("heading", { name: en.desk_confirm_title })).toBeVisible();
  await page.getByRole("checkbox", { name: en.desk_read_back_label }).check();
  await page.getByRole("checkbox", { name: en.desk_adult_label }).check();
  await page.getByRole("checkbox", { name: en.desk_privacy_label }).check();
  await page.getByRole("checkbox", { name: en.desk_consent_label }).check();
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("an officer registers a member whose phone is at the desk, with a code (FR-3)", async ({
  page,
}) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await page.getByRole("link", { name: "Open the registration desk" }).click();
  await expect(page.getByRole("heading", { level: 1, name: en.desk_title })).toBeVisible();
  await expectNoAxeViolations(page);

  // Errors are described in words, and nothing moves on until they are fixed.
  await next(page);
  await expect(page.getByText(en.err_required)).toBeVisible();

  await fillMember(page);
  await page.getByRole("radio", { name: en.desk_phone_otp }).check();
  await page.getByLabel(en.desk_phone_label, { exact: true }).fill(`07${randomDigits(8)}`);
  await next(page);

  await confirmAll(page);
  await expect(page.getByText(EVENT)).toBeVisible();
  await expectNoAxeViolations(page);
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: en.desk_send_code }).click();

  await page.getByLabel(en.desk_code_label).fill("123456");
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByText(en.err_code_wrong.replace("{count}", "4"))).toBeVisible();
  await page.getByLabel(en.desk_code_label).fill(TEST_CODE);
  await page.getByRole("button", { name: en.desk_submit }).click();

  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^REG-[2-9A-HJ-NP-Z]{5}$/)).toBeVisible();
  await expect(page.getByText(en.desk_done_sms)).toBeVisible();

  // The next person starts on their details, with the event kept.
  await page.getByRole("button", { name: en.desk_next_person }).click();
  await expect(page.getByRole("heading", { name: en.desk_member_title })).toBeVisible();
  await expect(page.getByLabel(en.desk_name_label, { exact: true })).toHaveValue("");
});

test("a member with no personal phone is registered in person, with no SMS (BR-06)", async ({
  page,
}) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await page.goto(`${ADMIN}/desk`);
  await fillMember(page, { newMember: true });
  await page.getByRole("radio", { name: en.desk_phone_none }).check();
  await expect(page.getByLabel(en.desk_phone_label, { exact: true })).toBeHidden();
  await next(page);
  await confirmAll(page);
  await expect(page.getByText(en.desk_verification_none)).toBeVisible();
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(en.desk_done_no_sms)).toBeVisible();
  await expect(page.getByText(en.desk_done_new_member)).toBeVisible();
});

test("a half-filled form survives a reload and a dropped connection", async ({ page, context }) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await page.goto(`${ADMIN}/desk`);
  await fillMember(page);
  await page.getByRole("radio", { name: en.desk_phone_unverified }).check();
  await page.getByLabel(en.desk_phone_label, { exact: true }).fill("0712 345 678");

  await page.reload();
  await expect(page.getByText(en.desk_restored)).toBeVisible();
  await expect(page.getByRole("radio", { name: en.desk_phone_unverified })).toBeChecked();
  await expect(page.getByLabel(en.desk_phone_label, { exact: true })).toHaveValue("0712 345 678");

  await context.setOffline(true);
  await next(page);
  await expect(page.getByRole("alert").filter({ hasText: en.desk_offline })).toBeVisible();
  await expect(page.getByLabel(en.desk_phone_label, { exact: true })).toHaveValue("0712 345 678");
  await context.setOffline(false);
  await next(page);

  await confirmAll(page);
  await expect(page.getByText("Test Person")).toBeVisible();
  await expect(page.getByText(en.desk_verification_unverified)).toBeVisible();
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible({
    timeout: 30_000,
  });

  // Submitted: nothing is left in the tab to restore.
  await page.reload();
  await expect(page.getByRole("heading", { name: en.desk_member_title })).toBeHidden();
  await expect(page.getByLabel(en.desk_event_title)).toHaveValue(EVENT);
  await expect(page.getByText(en.desk_restored)).toBeHidden();
});

test("staff without the Registration Officer role can't open the desk (NFR-8)", async ({
  page,
}) => {
  await signIn(page, ["MEMBERSHIP_ADMIN", "SUPER_ADMIN"]);
  await expect(page.getByRole("link", { name: "Open the registration desk" })).toBeHidden();
  const response = await page.goto(`${ADMIN}/desk`);
  expect(response?.status()).toBe(404);
});
