import { test, type Browser, type Page } from "@playwright/test";
import {
  ADMIN,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  registerAtDesk,
  signIn,
} from "./staff-helpers";

// Corrections by staff (issue #21, FR-5, BR-09): an administrator asks for a correction, an
// officer enters it, and the registration is back in the review queue with its earlier revision
// still viewable. Synthetic staff sign in through the real pages; every member is synthetic.
// Each test uses its own event name, so its registration is the only one the queue shows.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

async function otherStaff(browser: Browser, roles: string[], name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await preparePage(page, context);
  await signIn(page, roles, name);
  return page;
}

async function openFromQueue(page: Page, eventLabel: string, fullName: string) {
  await page.goto(`${ADMIN}/review`);
  await page.getByLabel("Event").selectOption({ label: eventLabel });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("1 waiting.")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(fullName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^REG-/ })).toBeVisible();
}

test("an officer corrects a registration and it returns to the review queue (FR-5)", async ({
  page,
  browser,
}) => {
  const eventLabel = `E2E correction ${randomDigits(6)}`;
  const fullName = `Misspelt Person ${randomDigits(4)}`;
  const corrected = `Corrected Person ${randomDigits(4)}`;
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  await registerAtDesk(page, { fullName, eventLabel });

  const admin = await otherStaff(browser, ["MEMBERSHIP_ADMIN"], "E2E Administrator");
  await openFromQueue(admin, eventLabel, fullName);
  const ask = admin.locator('[data-decision="correction"]');
  await ask.locator("summary").click();
  await ask.getByLabel("Reason").fill("Name misspelt; confirm the HBC");
  await ask.getByRole("button", { name: "Ask for a correction" }).click();
  await expect(admin).toHaveURL(`${ADMIN}/review?done=correction`);

  // The officer finds it under Corrections, with the administrator's reason.
  await page.goto(`${ADMIN}/`);
  await page.getByRole("link", { name: "Corrections" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Corrections" })).toBeVisible();
  await expectNoAxeViolations(page);
  await page.getByRole("link", { name: new RegExp(fullName) }).click();
  await expect(page.getByText("Name misspelt; confirm the HBC")).toBeVisible();
  await expectNoAxeViolations(page);

  // A wrong answer keeps what was typed and says which field to fix.
  await page.getByLabel("Full name").fill(corrected);
  await page.getByLabel("HBC").selectOption("");
  await page.getByRole("button", { name: "Save the correction" }).click();
  await expect(page.getByText("Choose the HBC.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue(corrected);

  await page.getByLabel("HBC").selectOption({ label: "Samaria" });
  await page.getByRole("button", { name: "Save the correction" }).click();
  await expect(page).toHaveURL(`${ADMIN}/corrections?done=1`);
  await expect(page.getByRole("status")).toHaveText(
    "Correction saved. The registration is back in the review queue.",
  );
  await expect(page.getByRole("link", { name: new RegExp(fullName) })).toBeHidden();

  // Back in the queue with the corrected details; the earlier revision is still there (BR-09).
  await openFromQueue(admin, eventLabel, corrected);
  await expect(admin.getByText("Samaria").first()).toBeVisible();
  await admin.getByText(/^Revision 1 ·/).click();
  await expect(admin.getByText(fullName)).toBeVisible();
  await expectNoAxeViolations(admin);
  await admin.context().close();
});
