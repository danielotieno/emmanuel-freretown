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

// The approval journey (issue #19, FR-4, NFR-8): an officer registers a member at the desk, and
// a Membership Administrator finds it in the review queue and decides. Synthetic staff sign in
// through the real pages (staff-helpers.ts); every member is synthetic. Each test uses its own
// event name, so its registration is the only one the queue's event filter shows.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

/** A second signed-in staff member, in their own browser context. */
async function otherStaff(browser: Browser, roles: string[], name: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await preparePage(page, context);
  await signIn(page, roles, name);
  return page;
}

/** Opens the one registration of `eventLabel` from the review queue. */
async function openFromQueue(page: Page, eventLabel: string, fullName: string) {
  await page.goto(`${ADMIN}/review`);
  await page.getByLabel("Event").selectOption({ label: eventLabel });
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByText("1 waiting.")).toBeVisible();
  await page.getByRole("link", { name: new RegExp(fullName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^REG-/ })).toBeVisible();
}

test("an administrator approves a registration from the queue (FR-4)", async ({
  page,
  browser,
}) => {
  const eventLabel = `E2E approval ${randomDigits(6)}`;
  const fullName = `Approval Person ${randomDigits(4)}`;
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  await registerAtDesk(page, { fullName, eventLabel });

  const admin = await otherStaff(browser, ["MEMBERSHIP_ADMIN"], "E2E Administrator");
  await admin.getByRole("link", { name: "Review queue" }).click();
  await expect(admin.getByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();
  await expectNoAxeViolations(admin);
  await openFromQueue(admin, eventLabel, fullName);
  await expect(admin.getByText("No personal phone")).toBeVisible();
  await expect(admin.getByText("Met in person by an officer")).toBeVisible();
  await expect(admin.getByText("E2E Officer").first()).toBeVisible();
  await expectNoAxeViolations(admin);

  await admin.getByRole("button", { name: "Approve" }).click();
  await expect(admin).toHaveURL(`${ADMIN}/review?done=approved`);
  await expect(admin.getByRole("status")).toHaveText("Approved. The member record was created.");
  await admin.getByLabel("Event").selectOption({ label: "Any event" });
  await expect(admin.getByRole("link", { name: new RegExp(fullName) })).toBeHidden();
  await admin.context().close();
});

test("the capturing officer can't approve (BR-10), and a stale decision says so (FR-4)", async ({
  page,
  browser,
}) => {
  const eventLabel = `E2E BR-10 ${randomDigits(6)}`;
  const fullName = `Captured Person ${randomDigits(4)}`;
  // The Church Secretary and Wardens hold both roles (requirements §3).
  await signIn(page, ["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"], "E2E Secretary");
  await registerAtDesk(page, { fullName, eventLabel });
  await openFromQueue(page, eventLabel, fullName);
  await expect(page.getByText(/You captured this registration/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toBeDisabled();

  // A second administrator rejects it while the first still has it open.
  const other = await otherStaff(browser, ["MEMBERSHIP_ADMIN"], "E2E Warden");
  await openFromQueue(other, eventLabel, fullName);
  const reject = other.locator('[data-decision="reject"]');
  await reject.locator("summary").click();
  await reject.getByLabel("Reason").fill("x");
  await reject.getByRole("button", { name: "Reject" }).click();
  await expect(reject.getByText("Please give a reason of at least 3 characters.")).toBeVisible();
  await reject.getByLabel("Reason").fill("Registered twice by mistake");
  await reject.getByRole("button", { name: "Reject" }).click();
  await expect(other).toHaveURL(`${ADMIN}/review?done=rejected`);
  await other.context().close();

  // The first administrator, still on the old page, asks for a correction: refused, clearly.
  const correction = page.locator('[data-decision="correction"]');
  await correction.locator("summary").click();
  await correction.getByLabel("Reason").fill("Wrong HBC");
  await correction.getByRole("button", { name: "Ask for a correction" }).click();
  await expect(page.getByText(/Someone else acted on this registration first/)).toBeVisible();
  await expect(page.getByText("Registered twice by mistake")).toBeVisible();
});

test("a Registration Officer alone can't open the review queue (NFR-8)", async ({ page }) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await expect(page.getByRole("link", { name: "Review queue" })).toBeHidden();
  expect((await page.goto(`${ADMIN}/review`))?.status()).toBe(404);
});
