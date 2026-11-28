import { test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import {
  ADMIN,
  disableCreatedStaff,
  expect,
  expectNoAxeViolations,
  preparePage,
  randomDigits,
  signIn,
} from "./staff-helpers";

// The import of the parish list (issue #104, FR-13, D47, NFR-8): a Membership Administrator
// uploads a synthetic CSV, checks the preview and confirms; the imported member then finds
// themselves on the public status check (FR-7, D48). The server runs in test mode: no SMS, the
// code is always 000000. Every row is synthetic.
//
// Chromium only, like the other staff journeys: admin.localhost resolves in Chromium alone.

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await preparePage(page, context);
});

test.afterAll(disableCreatedStaff);

function csv(rows: string[]): { name: string; mimeType: string; buffer: Buffer } {
  const text = ["fwo_number,full_name,phone,hbc,departments,language", ...rows].join("\n");
  return { name: "parish-list.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") };
}

test("imports the parish list after a preview; the member then finds their record (FR-13, FR-7)", async ({
  page,
}) => {
  const fwo = `0${randomDigits(7)}`;
  const phone = `07${randomDigits(8)}`;
  await signIn(page, ["MEMBERSHIP_ADMIN"]);
  await page.getByRole("link", { name: "Import the parish list" }).click();
  await expect(page.getByRole("heading", { name: "Import the parish list" })).toBeVisible();

  await page
    .getByLabel("The parish list, as a CSV file")
    .setInputFiles(
      csv([
        `${fwo},Test Imported Member,${phone},Bethlehem A,English Choir; KAYO,`,
        `${randomDigits(8)},Test Bad Row,0800 000 000,Narnia,,`,
      ]),
    );
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByText("will be imported as members")).toContainText("1 row");
  await expect(page.getByRole("row", { name: /^3\b/ })).toContainText(
    "Phone is not a Kenyan mobile number",
  );
  await expect(page.getByRole("row", { name: /^3\b/ })).toContainText(
    "HBC is not one of the active HBCs",
  );
  // The preview names rules, never a value from the file (rule 2).
  await expect(page.getByText("Test Bad Row")).toHaveCount(0);
  await expectNoAxeViolations(page);

  // The confirmation needs the Vicar's date and the tick.
  await page.getByRole("button", { name: "Import 1 member" }).click();
  await expect(page.getByText(/Tick this to confirm/)).toBeVisible();
  await page.getByLabel("Date the Vicar confirmed the members' consent").fill("2026-11-25");
  await page.getByLabel(/The Vicar has confirmed/).check();
  await page.getByRole("button", { name: "Import 1 member" }).click();
  await expect(page.getByRole("status")).toContainText("Imported 1 member. 1 row skipped.");

  // The same file again imports nothing: the FWO number is now a member's (BR-02).
  await page.getByRole("button", { name: "Import another file" }).click();
  await page
    .getByLabel("The parish list, as a CSV file")
    .setInputFiles(csv([`${fwo},Test Imported Member,${phone},Bethlehem A,,`]));
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByRole("row", { name: /^2\b/ })).toContainText(
    "FWO number already belongs to a member",
  );

  // The imported member checks their record on the public site, typing the number without the
  // file's leading zero: leading zeros don't count (D61).
  const publicPage = await page.context().newPage();
  await publicPage
    .context()
    .addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: "http://localhost" }]);
  const ip = `198.51.${randomDigits(2)}.${randomDigits(2)}`;
  await publicPage.route(/^http:\/\/localhost(:\d+)?\//, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await publicPage.goto(ADMIN.replace("admin.", "") + "/registration/status");
  await publicPage.getByLabel(en.status_phone_label).fill(phone);
  await publicPage.getByLabel(en.status_key_label).fill(fwo.slice(1));
  await publicPage.getByRole("button", { name: en.reg_continue }).click();
  await expect(publicPage.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await publicPage.getByRole("button", { name: en.reg_send_code }).click();
  await publicPage.getByLabel(en.reg_code_label).fill("000000");
  await publicPage.getByRole("button", { name: en.status_check }).click();
  await expect(publicPage.getByRole("heading", { name: en.status_member_title })).toBeVisible();
  await expect(publicPage.getByText("Test Imported Member")).toBeVisible();
  await expect(publicPage.getByText("Bethlehem A")).toBeVisible();
});

test("explains a file without the required columns", async ({ page }) => {
  await signIn(page, ["MEMBERSHIP_ADMIN"]);
  await page.goto(`${ADMIN}/members/import`);
  await page.getByLabel("The parish list, as a CSV file").setInputFiles({
    name: "list.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,phone\nTest Person,0712000000"),
  });
  await page.getByRole("button", { name: "Check the file" }).click();
  // Next's route announcer is an alert too, so find the message by its text.
  await expect(page.getByText("This file can't be read.")).toBeVisible();
  await expect(
    page.getByText("These column headings are missing: fwo_number, full_name, hbc."),
  ).toBeVisible();
});

test("a Registration Officer alone can't open the import (NFR-8)", async ({ page }) => {
  await signIn(page, ["REGISTRATION_OFFICER"]);
  await expect(page.getByRole("link", { name: "Import the parish list" })).toBeHidden();
  expect((await page.goto(`${ADMIN}/members/import`))?.status()).toBe(404);
});
