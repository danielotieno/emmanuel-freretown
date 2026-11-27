import { test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import {
  ADMIN,
  confirmAll,
  disableCreatedStaff,
  EVENT,
  expect,
  expectNoAxeViolations,
  fillMember,
  next,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// The assisted-registration journey at the officer desk (issue #18, FR-3, NFR-8). A synthetic
// Registration Officer signs in and sets up an authenticator app through the real pages
// (staff-helpers.ts). The server runs in test mode (E2E_TEST_MODE): no SMS is sent and every
// code is 000000. Turnstile uses Cloudflare's always-pass test keys.
//
// Chromium only, like tests/e2e/staff.spec.ts: admin.localhost resolves in Chromium alone. The
// 360 × 800 Android project is the "mid-range Android phone" FR-3 asks for.

test.describe.configure({ timeout: 120_000 });

const TEST_CODE = "000000";

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

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
  // The SMS language is asked with each member's phone (NFR-5).
  await page.getByRole("radio", { name: "Kiswahili" }).check();
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

test("a new member who doesn't know their HBC is registered, the HBC left to the Secretary (D49)", async ({
  page,
}) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await page.goto(`${ADMIN}/desk`);
  await page.getByLabel(en.desk_event_title).fill(`E2E D49 ${randomDigits(6)}`);
  await next(page);
  await page.getByLabel(en.desk_name_label, { exact: true }).fill("Test Newcomer");
  // Only offered once the member is a new one.
  const unknown = page.getByRole("checkbox", { name: en.desk_hbc_unknown_label });
  await expect(unknown).toHaveCount(0);
  await page.getByRole("checkbox", { name: en.desk_new_member_label }).check();
  await unknown.check();
  await expect(page.getByLabel(en.desk_hbc_label, { exact: true })).toBeDisabled();
  await next(page);
  await page.getByRole("radio", { name: en.desk_phone_none }).check();
  await next(page);
  await confirmAll(page);
  await expect(page.getByText(en.reg_hbc_unknown_value)).toBeVisible();
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible({
    timeout: 30_000,
  });
});

test("a half-filled form survives a reload and a dropped connection", async ({ page, context }) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await page.goto(`${ADMIN}/desk`);
  await fillMember(page);
  await page.getByRole("radio", { name: en.desk_phone_unverified }).check();
  // A fresh number each run: the confirmation counts against the phone's hourly limit.
  const phone = `07${randomDigits(2)} ${randomDigits(3)} ${randomDigits(3)}`;
  await page.getByLabel(en.desk_phone_label, { exact: true }).fill(phone);

  await page.reload();
  await expect(page.getByText(en.desk_restored)).toBeVisible();
  await expect(page.getByRole("radio", { name: en.desk_phone_unverified })).toBeChecked();
  await expect(page.getByLabel(en.desk_phone_label, { exact: true })).toHaveValue(phone);

  await context.setOffline(true);
  await next(page);
  await expect(page.getByRole("alert").filter({ hasText: en.desk_offline })).toBeVisible();
  await expect(page.getByLabel(en.desk_phone_label, { exact: true })).toHaveValue(phone);
  await context.setOffline(false);
  await next(page);

  await confirmAll(page);
  await expect(page.getByText("Test Person")).toBeVisible();
  await expect(page.getByText(en.desk_verification_unverified)).toBeVisible();
  // The confirmation goes to a number no code has checked: Turnstile first (rule 8).
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/);
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible({
    timeout: 30_000,
  });

  // Submitted: nothing is left in the tab to restore, and no desk key holds the member.
  const stored = await page.evaluate(() => JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("Test Person");
  expect(stored).not.toContain(phone);
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
