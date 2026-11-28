import { test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import {
  ADMIN,
  disableCreatedStaff,
  disableLater,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  setUpAuthenticator,
  signIn,
} from "./staff-helpers";

// Staff account management (issue #91, FR-10): a Super Administrator adds a staff member, who
// signs in with the temporary password, chooses their own and sets up an authenticator app;
// the Super Administrator then grants them a role and resets their authenticator app. Other
// staff can't open the page. All people and addresses are synthetic.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

const NEW_PASSWORD = "a passphrase only the new officer knows";

test("a Super Administrator adds a staff member, who replaces the temporary password (FR-10)", async ({
  page,
  browser,
}) => {
  await signIn(page, ["SUPER_ADMIN"], "E2E Super Administrator");
  // The staff home page has the portal's own title, with the parish's name from site_name (#68).
  await expect(page).toHaveTitle(`Staff · ${en.site_name}`);
  await page.getByRole("link", { name: "Staff accounts" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Staff accounts" })).toBeVisible();
  await expectNoAxeViolations(page);

  // Refused without a role; what was typed stays.
  const email = `e2e-new-${randomDigits(8)}@example.org`;
  await page.getByLabel("Full name").fill("E2E New Officer");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Add staff member" }).click();
  await expect(page.getByText("Choose at least one role.")).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveValue(email);

  await page.getByRole("checkbox", { name: "Registration Officer" }).check();
  await page.getByRole("button", { name: "Add staff member" }).click();
  const shown = page.locator("p.font-mono");
  await expect(shown).toBeVisible();
  const temporary = await shown.innerText();
  expect(temporary).toMatch(/^\w{4}-\w{4}-\w{4}-\w{4}$/);
  await expectNoAxeViolations(page);
  const href = await page.getByRole("link", { name: /Open E2E New Officer/ }).getAttribute("href");
  disableLater(decodeURIComponent(href!.replace("/staff/", "")));

  // The new officer, in their own browser.
  const context = await browser.newContext();
  const officer = await context.newPage();
  await preparePage(officer, context);
  await officer.goto(`${ADMIN}/sign-in`);
  await officer.waitForLoadState("networkidle");
  await officer.getByLabel("Email address").fill(email);
  await officer.getByLabel("Password").fill(temporary);
  await officer.getByRole("button", { name: "Continue" }).click();
  await expect(officer).toHaveURL(`${ADMIN}/change-password`);
  await expect(officer.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  await expectNoAxeViolations(officer);
  // Nothing else is reachable first.
  await officer.goto(`${ADMIN}/desk`);
  await expect(officer).toHaveURL(`${ADMIN}/change-password`);

  await officer.getByLabel("Temporary password").fill(temporary);
  await officer.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await officer.getByLabel("New password again").fill(NEW_PASSWORD);
  await officer.getByRole("button", { name: "Change password" }).click();
  await expect(officer).toHaveURL(`${ADMIN}/enrol`);
  await setUpAuthenticator(officer, NEW_PASSWORD);
  // The overview names their one role under the greeting.
  await expect(officer.getByText(/· Registration Officer$/)).toBeVisible();

  // Back to the Super Administrator: grant a role, then reset the authenticator app.
  await page.goto(`${ADMIN}${href}`);
  await expect(page.getByRole("heading", { level: 1, name: "E2E New Officer" })).toBeVisible();
  await expect(page.getByText("Their own", { exact: true })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("button", { name: "Grant Membership Administrator" }).click();
  await expect(page.getByText(/^Role granted\./)).toBeVisible();
  await page.getByText("Reset their authenticator app").click();
  await page.getByRole("button", { name: "Remove the authenticator app" }).click();
  await expect(page.getByText(/^Authenticator app removed/)).toBeVisible();
  await expect(page.getByText("Not set up", { exact: true })).toBeVisible();

  // Signed out by the reset, the officer must set up an app again.
  await officer.goto(`${ADMIN}/`);
  await expect(officer).toHaveURL(`${ADMIN}/sign-in`);
  await context.close();
});

test("other staff can't open staff accounts (FR-10, requirements §3)", async ({ page }) => {
  await signIn(page, ["MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"]);
  await expect(page.getByRole("link", { name: "Staff accounts" })).toHaveCount(0);
  const response = await page.goto(`${ADMIN}/staff`);
  expect(response?.status()).toBe(404);
});
