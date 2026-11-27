import { test } from "@playwright/test";
import {
  ADMIN,
  asOwner,
  createMember,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// A former member's record after D45's removal (issue #26): the name, phone and departments are
// gone, the FWO number and status stay, and the pages say so. The removal itself is tested
// against Postgres (tests/integration/jobs.test.ts); here the owner sets the end state.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

test("a removed member's record shows its FWO number and status, not their details (D45)", async ({
  page,
}) => {
  const fullName = `Departed Member ${randomDigits(6)}`;
  const { id, fwoNumber } = await createMember(fullName);
  await asOwner(
    `UPDATE member SET status = 'DECEASED', status_reason = 'Synthetic reason',
            full_name = NULL, phone_e164 = NULL, personal_data_redacted_at = now()
      WHERE id = $1`,
    [id],
  );
  await signIn(page, ["MEMBERSHIP_ADMIN"], "E2E Retention Administrator");

  await page.goto(`${ADMIN}/members/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Name removed (D45)" })).toBeVisible();
  await expect(page.getByText(fwoNumber).first()).toBeVisible();
  await expect(page.getByText(/were removed on .*one year after the change \(D45\)/)).toBeVisible();
  await expect(page.getByText(fullName)).toHaveCount(0);
  await expectNoAxeViolations(page);

  await page.goto(`${ADMIN}/members?status=DECEASED`);
  await expect(page.getByRole("link", { name: new RegExp(fwoNumber) })).toContainText(
    "Name removed (D45)",
  );
});
