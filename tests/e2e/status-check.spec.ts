import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };

// The status-check journey (issue #20, FR-7, D24, D48) on all four viewports. The server runs in
// test mode (E2E_TEST_MODE): no SMS is sent and the code is always 000000. Turnstile uses
// Cloudflare's always-pass test keys. Every test uses its own synthetic phone and IP.

test.describe.configure({ timeout: 240_000 });

const PAGE_WEIGHT_BUDGET_BYTES = 200 * 1024; // NFR-2
const TEST_CODE = "000000";

function randomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
}

test.beforeEach(async ({ page, context }) => {
  const ip = `198.51.${randomDigits(2)}.${randomDigits(2)}`;
  await page.route(/^http:\/\/localhost(:\d+)?\//, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: "http://localhost" }]);
});

async function waitForTurnstile(page: Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
}

/** Self-registers a synthetic member and returns their phone and reference. */
async function register(page: Page) {
  const phone = `07${randomDigits(8)}`;
  const next = () => page.getByRole("button", { name: en.reg_continue }).click();
  await page.goto("/registration");
  await page.getByLabel(en.reg_name_label).fill("Test Status Person");
  await next();
  await page.getByLabel(en.reg_fwo_label).fill(`8${randomDigits(5)}`);
  await next();
  await page.getByLabel(en.reg_hbc_label).selectOption({ label: "Galilaya" });
  await next();
  await next();
  await page.getByLabel(en.reg_phone_label).fill(phone);
  await next();
  await page.getByLabel(en.reg_adult_label).check();
  await page.getByLabel(en.reg_privacy_label).check();
  await page.getByLabel(en.reg_consent_label).check();
  await next();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: en.reg_send_code }).click();
  await page.getByLabel(en.reg_code_label).fill(TEST_CODE);
  await page.getByRole("button", { name: en.reg_verify }).click();
  const reference = page.getByText(/^REG-[2-9A-HJ-NP-Z]{5}$/);
  await expect(reference).toBeVisible({ timeout: 30_000 });
  return { phone, reference: (await reference.textContent())!.trim() };
}

/** Runs the status check up to its answer. */
async function check(page: Page, phone: string, key: string) {
  await page.goto("/registration/status");
  await page.getByLabel(en.status_phone_label).fill(phone);
  await page.getByLabel(en.status_key_label).fill(key);
  await page.getByRole("button", { name: en.reg_continue }).click();
  await expect(page.getByRole("heading", { name: en.status_review_title })).toBeVisible();
  await waitForTurnstile(page);
  await page.getByRole("button", { name: en.reg_send_code }).click();
  await page.getByLabel(en.reg_code_label).fill(TEST_CODE);
  await page.getByRole("button", { name: en.status_check }).click();
}

test("shows a member's own registration after the code: status, name, HBC (FR-7, D48)", async ({
  page,
}) => {
  const { phone, reference } = await register(page);
  // Registering just sent this phone a code; FR-2 allows the next one after 60 seconds, so a
  // member checking straight away is asked to wait. Wait it out, as they would.
  await page.waitForTimeout(61_000);
  // From the registration page's link, as a member who is unsure would.
  await page.goto("/registration");
  await page.getByRole("link", { name: en.reg_check_first_link }).click();
  await expect(page).toHaveURL(/\/registration\/status$/);

  await check(page, phone, reference.toLowerCase());
  await expect(page.getByRole("heading", { name: en.status_received_title })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Test Status Person")).toBeVisible();
  await expect(page.getByText("Galilaya")).toBeVisible();
  await expect(page.getByText(en.status_wrong_note)).toBeVisible();
  // Nothing typed is in the URL (rule 2).
  expect(page.url()).not.toContain(phone);
  expect(page.url()).not.toContain(reference);
});

test("gives a non-match the one same answer, with a link to register (rule 3)", async ({
  page,
}) => {
  await check(page, `07${randomDigits(8)}`, `7${randomDigits(6)}`);
  await expect(page.getByRole("heading", { name: en.status_not_found })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: en.status_register_link })).toHaveAttribute(
    "href",
    "/registration",
  );
  await expect(page.getByText(en.status_name_label)).toHaveCount(0);
});

test("asks again for a number that is neither an FWO nor a reference", async ({ page }) => {
  await page.goto("/registration/status");
  await page.getByLabel(en.status_phone_label).fill("0712");
  await page.getByLabel(en.status_key_label).fill("12a");
  await page.getByRole("button", { name: en.reg_continue }).click();
  await expect(page.getByText(en.err_phone_invalid)).toBeVisible();
  await expect(page.getByText(en.status_key_invalid)).toBeVisible();
  await expect(page.getByLabel(en.status_key_label)).toHaveValue("12a");
});

test("is sent with Cache-Control: no-store", async ({ request }) => {
  const response = await request.get("/registration/status");
  expect(response.headers()["cache-control"]).toContain("no-store");
});

test("has no WCAG 2.2 AA violations on the first step and the review", async ({ page }) => {
  const scan = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("iframe")
      .analyze();
  await page.goto("/registration/status");
  expect((await scan()).violations).toEqual([]);
  await page.getByLabel(en.status_phone_label).fill(`07${randomDigits(8)}`);
  await page.getByLabel(en.status_key_label).fill("42");
  await page.getByRole("button", { name: en.reg_continue }).click();
  await expect(page.getByRole("heading", { name: en.status_review_title })).toBeVisible();
  expect((await scan()).violations).toEqual([]);
});

test("first load stays under 200 KB, and Turnstile loads only at the code step", async ({
  page,
}) => {
  let firstLoad = 0;
  let turnstileOnFirstLoad = 0;
  const pending: Promise<void>[] = [];
  const count = (request: Request) => {
    if (request.url().startsWith("https://challenges.cloudflare.com/")) turnstileOnFirstLoad++;
    pending.push(
      request.sizes().then((s) => {
        firstLoad += s.responseBodySize + s.responseHeadersSize;
      }),
    );
  };
  page.on("requestfinished", count);
  await page.goto("/registration/status", { waitUntil: "networkidle" });
  await Promise.all(pending);
  page.off("requestfinished", count);
  expect(firstLoad).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(turnstileOnFirstLoad).toBe(0);
});
