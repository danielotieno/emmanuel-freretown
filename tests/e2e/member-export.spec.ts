import { readFile } from "node:fs/promises";
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

// The CSV export (issue #25, FR-12): a Membership Administrator downloads the active members; a
// Registration Officer can't. Synthetic staff and members only.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

test("an administrator downloads the active members as CSV (FR-12)", async ({ page }) => {
  const fullName = `Exported Member ${randomDigits(6)}`;
  const { fwoNumber } = await createMember(fullName);
  await signIn(page, ["MEMBERSHIP_ADMIN"], "E2E Export Administrator");
  await page.getByRole("link", { name: "Members", exact: true }).click();
  const section = page.getByRole("region", { name: "Export" });
  await expect(section).toBeVisible();
  await expectNoAxeViolations(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    section.getByRole("button", { name: "Download the CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^active-members-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.startsWith('﻿"fwo_number","full_name","phone","hbc","departments"\r\n')).toBe(true);
  expect(csv).toContain(`"${fwoNumber}","${fullName}","","Judea",""\r\n`);
  // The download leaves the page where it was, with no personal data in its URL (rule 2).
  expect(page.url()).toBe(`${ADMIN}/members`);
});

test("a Registration Officer can't export (FR-12, requirements §3)", async ({ page }) => {
  await signIn(page, ["REGISTRATION_OFFICER"], "E2E Officer");
  const response = await page.request.post(`${ADMIN}/members/export`);
  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain("fwo_number");
});
