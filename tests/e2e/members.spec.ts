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

// Member records (issue #22, FR-6): a Membership Administrator finds a member, corrects their
// details, moves them to another HBC and changes their status, each with a reason; a Registration
// Officer can't open the records. Synthetic staff sign in through the real pages; every member is
// synthetic, created as if imported.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

test("an administrator finds a member and changes the record, with reasons (FR-6)", async ({
  page,
}) => {
  const fullName = `Misspelt Member ${randomDigits(6)}`;
  const corrected = `Corrected Member ${randomDigits(6)}`;
  await createMember(fullName);
  await signIn(page, ["MEMBERSHIP_ADMIN"], "E2E Administrator");

  await page.getByRole("link", { name: "Members", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expectNoAxeViolations(page);

  // The search posts its terms: they never reach the URL (rule 2).
  await page.getByLabel("Name, FWO number or mobile number").fill(fullName);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("1 match.")).toBeVisible();
  expect(page.url()).toBe(`${ADMIN}/members`);
  // The member is in the list below too; open them from the results.
  await page
    .getByRole("region", { name: "Find a member" })
    .getByRole("link", { name: new RegExp(fullName) })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: fullName })).toBeVisible();
  await expectNoAxeViolations(page);

  // No reason: refused, and what was typed stays.
  const details = page.locator('[data-change="details"]');
  await details.locator("summary").click();
  await details.getByLabel("Full name").fill(corrected);
  await details.getByRole("button", { name: "Save the details" }).click();
  await expect(details.getByText("Give the reason for this change.")).toBeVisible();
  await expect(details.getByLabel("Full name")).toHaveValue(corrected);
  await expectNoAxeViolations(page);

  await details.getByLabel("Reason").fill("Name misspelt on the parish list");
  await details.getByRole("button", { name: "Save the details" }).click();
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: corrected })).toBeVisible();

  // Move to another HBC: the earlier one stays in the history.
  const hbc = page.locator('[data-change="hbc"]');
  await hbc.locator("summary").click();
  await hbc.getByLabel("New HBC").selectOption({ label: "Samaria" });
  await hbc.getByLabel("Reason").fill("Moved house");
  await hbc.getByRole("button", { name: "Move to this HBC" }).click();
  await expect(page.getByText(/Moved to the new HBC/)).toBeVisible();
  const history = page.getByRole("list").filter({ hasText: "current" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByRole("listitem").first()).toContainText("Samaria");

  // Deceased needs the tick that it is final; then the record closes.
  const status = page.locator('[data-change="status"]');
  await status.locator("summary").click();
  await status.getByLabel("New status").selectOption({ label: "Deceased" });
  await status.getByLabel("Reason").fill("Recorded by the Church Secretary");
  await status.getByRole("button", { name: "Change the status" }).click();
  await expect(status.getByText(/Tick to confirm this is the right member/)).toBeVisible();
  await expect(status.getByLabel("New status")).toHaveValue("DECEASED");
  await status.getByLabel(/I have checked this is the right member/).check();
  await status.getByRole("button", { name: "Change the status" }).click();
  await expect(page.getByText("Status changed.")).toBeVisible();
  await expect(page.getByText(/This record is closed/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change the record" })).toHaveCount(0);
  await expectNoAxeViolations(page);
});

test("a Registration Officer can't open member records (FR-6, NFR-8)", async ({ page }) => {
  const { id } = await createMember(`Hidden Member ${randomDigits(6)}`);
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  await expect(page.getByRole("link", { name: "Members", exact: true })).toHaveCount(0);
  expect((await page.goto(`${ADMIN}/members`))?.status()).toBe(404);
  expect((await page.goto(`${ADMIN}/members/${id}`))?.status()).toBe(404);
  expect((await page.goto(`${ADMIN}/members/${randomUUID()}`))?.status()).toBe(404);
});
