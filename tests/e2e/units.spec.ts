import { test } from "@playwright/test";
import {
  ADMIN,
  asOwner,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// HBCs and departments (issue #23, FR-9): a Membership Administrator adds, renames, moves and
// deactivates a department; a Registration Officer can't open the page. The department is
// synthetic, and removed by the owner afterwards so a long-lived dev database doesn't collect
// them (the application itself never deletes a unit).
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

const created: string[] = [];

test.afterAll(async () => {
  await disableCreatedStaff();
  if (created.length) {
    await asOwner("DELETE FROM department WHERE name = ANY($1)", [created]);
  }
});

test("an administrator adds, renames, moves and deactivates a department (FR-9)", async ({
  page,
}) => {
  const name = `E2E Ministry ${randomDigits(6)}`;
  const renamed = `${name} Renamed`;
  created.push(name, renamed);
  await signIn(page, ["MEMBERSHIP_ADMIN"], "E2E Units Administrator");
  await page.getByRole("link", { name: "HBCs and departments" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "HBCs and departments" })).toBeVisible();
  await expectNoAxeViolations(page);

  const departments = page.getByRole("region", { name: "Departments" });
  await departments.getByLabel("Add a new department").fill(name);
  await departments.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(/^Added\./)).toBeVisible();
  const row = departments.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();

  // The same name in other capitals is refused, and what was typed stays.
  await departments.getByLabel("Add a new department").fill(name.toUpperCase());
  await departments.getByRole("button", { name: "Add" }).click();
  await expect(departments.getByText(/Another department already has this name/)).toBeVisible();
  await expect(departments.getByLabel("Add a new department")).toHaveValue(name.toUpperCase());
  await expectNoAxeViolations(page);

  await row.locator("summary").click();
  await row.getByLabel("New name").fill(renamed);
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByText(/^Renamed\./)).toBeVisible();
  const renamedRow = departments.getByRole("listitem").filter({ hasText: renamed });

  await renamedRow.getByRole("button", { name: `Move up ${renamed}` }).click();
  await expect(page.getByText(/^Moved\./)).toBeVisible();
  // No longer last: something follows it.
  await expect(departments.getByRole("listitem").last()).not.toContainText(renamed);

  await renamedRow.getByRole("button", { name: `Deactivate ${renamed}` }).click();
  await expect(page.getByText(/^Deactivated\./)).toBeVisible();
  await expect(renamedRow).toContainText("Inactive");
  await expect(renamedRow.getByRole("button", { name: `Reactivate ${renamed}` })).toBeVisible();
  await expectNoAxeViolations(page);
});

test("a Registration Officer can't manage HBCs and departments (requirements §3)", async ({
  page,
}) => {
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  await expect(page.getByRole("link", { name: "HBCs and departments" })).toHaveCount(0);
  expect((await page.goto(`${ADMIN}/units`))?.status()).toBe(404);
});
