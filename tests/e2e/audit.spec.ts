import { randomUUID } from "node:crypto";
import { test } from "@playwright/test";
import {
  ADMIN,
  createMember,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// The audit trail viewer (issue #24, FR-11): administrators see a member's or registration's
// trail on its page; only Super Administrators see the full log, where entries about a member
// link to the record instead of showing its values. Synthetic staff and members only.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

test("an administrator sees a member's trail but not the full log (FR-11)", async ({ page }) => {
  const fullName = `Trail Member ${randomDigits(6)}`;
  const { id } = await createMember(fullName);
  await signIn(page, ["MEMBERSHIP_ADMIN"], "E2E Trail Administrator");
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);

  await page.goto(`${ADMIN}/members/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
  // Opening the record is the newest entry of its own trail (D31).
  const trail = page.getByRole("region", { name: "Audit trail" }).getByRole("listitem");
  await expect(trail.first()).toContainText("Opened");
  await expect(trail.first()).toContainText("E2E Trail Administrator");
  await expectNoAxeViolations(page);

  expect((await page.goto(`${ADMIN}/audit`))?.status()).toBe(404);
});

test("a Super Administrator reads the full log and opens a record from it (FR-11)", async ({
  page,
}) => {
  const fullName = `Logged Member ${randomDigits(6)}`;
  const { id } = await createMember(fullName);
  await signIn(page, ["SUPER_ADMIN"], "E2E Super Administrator");
  await page.goto(`${ADMIN}/members/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();

  await page.goto(`${ADMIN}/`);
  await page.getByRole("link", { name: "Audit log" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
  await expectNoAxeViolations(page);
  // The log names no member: the entry links to the record, whose opening is recorded.
  await expect(page.getByText(fullName)).toHaveCount(0);
  const entry = page
    .getByRole("listitem")
    .filter({ has: page.locator(`a[href="/members/${id}"]`) })
    .first();
  await expect(entry).toContainText("E2E Super Administrator");
  await entry.getByRole("link", { name: "Member record" }).click();
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
});

test("a Registration Officer sees neither the full log nor a trail (FR-11)", async ({ page }) => {
  const { id } = await createMember(`Unseen Member ${randomDigits(6)}`);
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
  expect((await page.goto(`${ADMIN}/audit`))?.status()).toBe(404);
  expect((await page.goto(`${ADMIN}/members/${id}`))?.status()).toBe(404);
  expect((await page.goto(`${ADMIN}/review/${randomUUID()}`))?.status()).toBe(404);
});
