import { test, type Page } from "@playwright/test";
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

// The staff overview (the portal's first page): an administrator sees the queue, the
// registrations coming in and the membership; a Registration Officer sees their own desk and no
// membership figures. Synthetic staff sign in through the real pages; every member is synthetic.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

/** Nothing is wider than the screen: tables and the navigation scroll inside themselves. */
async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("an administrator sees the queue, the registrations and the membership", async ({ page }) => {
  await createMember(`Overview Member ${randomDigits(6)}`);
  await signIn(page, ["MEMBERSHIP_ADMIN"], "Overview Administrator");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(", Overview");
  const nav = page.getByRole("navigation", { name: "Staff" });
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  // An administrator who isn't an officer or a Super Administrator gets neither of their links.
  await expect(nav.getByRole("link", { name: "Registration desk" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Staff accounts" })).toHaveCount(0);

  for (const title of [
    "Waiting for review",
    "Registrations received",
    "Next in the queue",
    "Members by HBC",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
  // The chart's figures are in a table for screen readers: 14 days, today last.
  await expect(
    page.getByRole("table", { name: /Registrations received on each of the last 14 days/ }),
  ).toBeAttached();
  // The member just created is counted in their HBC: Judea's row shows at least one.
  await expect(page.getByRole("listitem").filter({ hasText: /^Judea\s*[1-9]/ })).toBeVisible();

  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);

  // The account menu names the person and holds the two things they do to their own account.
  await page.getByRole("button", { name: "Your account: Overview Administrator" }).click();
  await expect(page.getByRole("menuitem", { name: "Change your password" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${ADMIN}/sign-in`);
});

test("a Registration Officer sees their own desk and no membership figures", async ({ page }) => {
  await signIn(page, ["REGISTRATION_OFFICER"], "Overview Officer");

  await expect(
    page.getByRole("heading", { level: 2, name: "Registered by you at the desk today" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Sent back to correct" })).toBeVisible();
  for (const title of ["Waiting for review", "Members by HBC", "Next in the queue"]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toHaveCount(0);
  }
  await expect(page.getByText("Active members")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Register a member" })).toHaveAttribute(
    "href",
    "/desk",
  );

  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page);
});
