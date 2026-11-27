import { test, type Browser, type Page } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import {
  ADMIN,
  confirmAll,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  fillMember,
  next,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// New members' FWO numbers (issue #101, BR-16, D30, NFR-8): an officer registers a new member
// at the desk; the Church Secretary records the highest number ever issued, enters the number
// they issued on the registration, and approves it. Synthetic staff and members only.
//
// The D30 setting is one row shared by every test running at once, so this test enters a random
// number of its own rather than relying on the exact suggestion. The setting can't go below a
// number already issued (D2): it is set to 14 digits, above every 10-digit number tests issue.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

async function officerRegistersNewMember(
  browser: Browser,
  eventLabel: string,
  fullName: string,
  hbcUnknown = false,
) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await preparePage(page, context);
  await signIn(page, ["REGISTRATION_OFFICER"], "Desk Officer");
  await page.goto(`${ADMIN}/desk`);
  await fillMember(page, { newMember: true, hbcUnknown, fullName, eventLabel });
  await page.getByRole("radio", { name: en.desk_phone_none }).check();
  await next(page);
  await confirmAll(page);
  await page.getByRole("button", { name: en.desk_submit }).click();
  await expect(page.getByRole("heading", { name: en.desk_done_title })).toBeVisible();
  await context.close();
}

async function openFromQueue(page: Page, eventLabel: string, fullName: string) {
  await page.goto(`${ADMIN}/review`);
  await page.getByLabel("Event").selectOption({ label: eventLabel });
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("link", { name: new RegExp(fullName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^REG-/ })).toBeVisible();
}

test("the Secretary records D30's number, enters a new member's FWO number and approves (BR-16)", async ({
  page,
  browser,
}) => {
  const eventLabel = `E2E FWO ${randomDigits(6)}`;
  const fullName = `New Member ${randomDigits(4)}`;
  await officerRegistersNewMember(browser, eventLabel, fullName);

  await signIn(page, ["MEMBERSHIP_ADMIN"], "Church Secretary");
  await page.getByRole("link", { name: "FWO numbers" }).click();
  await expect(page.getByRole("heading", { name: "FWO numbers" })).toBeVisible();
  await page.getByLabel("Highest FWO number ever issued").fill("12a");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Use digits only, as on the envelopes (BR-01).")).toBeVisible();
  await page.getByLabel("Highest FWO number ever issued").fill(`9${randomDigits(13)}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expectNoAxeViolations(page);

  await openFromQueue(page, eventLabel, fullName);
  await expect(page.getByText(/No FWO number yet/)).toBeVisible();
  const field = page.getByLabel("FWO number issued");
  await expect(field).toHaveValue(/^[0-9]+$/); // D30's suggestion, filled in
  await expectNoAxeViolations(page);

  await field.fill(`9${randomDigits(9)}`);
  await page.getByRole("button", { name: "Enter FWO number" }).click();
  await expect(
    page.getByText("FWO number entered. The registration can now be approved."),
  ).toBeVisible();
  await expect(page.getByText("FWO number confirmed by the Secretary")).toBeVisible();
  await expect(page.getByText(/No FWO number yet/)).toBeHidden();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(`${ADMIN}/review?done=approved`);
});

test("the Secretary sets the HBC of a new member who didn't know it, with the FWO number (D49)", async ({
  page,
  browser,
}) => {
  const eventLabel = `E2E D49 ${randomDigits(6)}`;
  const fullName = `Newcomer ${randomDigits(4)}`;
  await officerRegistersNewMember(browser, eventLabel, fullName, true);

  await signIn(page, ["MEMBERSHIP_ADMIN"], "Church Secretary");
  await page.goto(`${ADMIN}/fwo`);
  await page.getByLabel("Highest FWO number ever issued").fill(`9${randomDigits(13)}`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await openFromQueue(page, eventLabel, fullName);
  await expect(page.getByText(/No HBC yet/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Issue an FWO number and set the HBC" }),
  ).toBeVisible();
  const issued = `9${randomDigits(9)}`;
  await page.getByLabel("FWO number issued").fill(issued);
  // Without an HBC the number is refused: the member didn't know it.
  await page.getByRole("button", { name: "Enter FWO number" }).click();
  await expect(page.getByText(/Choose this member's HBC/)).toBeVisible();
  // The number typed stays, never replaced by the suggestion (#124).
  await expect(page.getByLabel("FWO number issued")).toHaveValue(issued);
  // The HBC chosen stays too, after a refusal for something else (#124).
  const hbc = page.getByLabel("HBC", { exact: true });
  await hbc.selectOption({ label: "Samaria" });
  await page.getByLabel("FWO number issued").fill("12a");
  await page.getByRole("button", { name: "Enter FWO number" }).click();
  await expect(page.getByText("Use digits only (BR-01).")).toBeVisible();
  await expect(hbc.locator("option:checked")).toHaveText("Samaria");
  await page.getByLabel("FWO number issued").fill(issued);
  await page.getByRole("button", { name: "Enter FWO number" }).click();
  await expect(
    page.getByText("FWO number entered. The registration can now be approved."),
  ).toBeVisible();
  await expect(page.getByText(/No HBC yet/)).toBeHidden();

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page).toHaveURL(`${ADMIN}/review?done=approved`);
});

test("a Registration Officer alone can't open the FWO numbers page (NFR-8)", async ({ page }) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await expect(page.getByRole("link", { name: "FWO numbers" })).toBeHidden();
  expect((await page.goto(`${ADMIN}/fwo`))?.status()).toBe(404);
});
