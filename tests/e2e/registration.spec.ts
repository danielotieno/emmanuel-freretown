import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Request } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import sw from "../../messages/sw.json" with { type: "json" };

// The self-registration journey (issue #16, FR-1) on all four viewports. The server runs in test
// mode (E2E_TEST_MODE, src/app/_lib/env.ts): no SMS is sent and the code is always 000000.
// Turnstile uses Cloudflare's always-pass test keys. Every test uses its own synthetic phone and
// IP, so the rate limits (#13) never make reruns flaky.

// Each step is a round trip to the database; against a remote test database a journey takes
// tens of seconds. CI's database is local and fast.
test.describe.configure({ timeout: 90_000 });

const PAGE_WEIGHT_BUDGET_BYTES = 200 * 1024; // NFR-2
const TEST_CODE = "000000";

function randomDigits(count: number): string {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");
}

test.beforeEach(async ({ page, context }) => {
  // Locally there is no Cloudflare in front, so the app trusts CF-Connecting-IP as the client IP.
  // Only on requests to the app: Cloudflare's own servers (Turnstile) refuse a client-sent CF-*.
  const ip = `198.51.${randomDigits(2)}.${randomDigits(2)}`;
  await page.route(/^http:\/\/localhost(:\d+)?\//, (route) =>
    route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } }),
  );
  await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: "http://localhost" }]);
});

async function next(page: Page) {
  await page.getByRole("button", { name: en.reg_continue }).click();
}

/** Fills every step up to the review, with a fresh synthetic phone. */
async function fillDetails(page: Page) {
  const phone = `07${randomDigits(8)}`;
  await page.goto("/registration");
  await page.getByLabel(en.reg_name_label).fill("Test Person");
  await next(page);
  await page.getByLabel(en.reg_fwo_label).fill(`9${randomDigits(5)}`);
  await next(page);
  await page.getByLabel(en.reg_hbc_label).selectOption({ label: "Judea" });
  await next(page);
  await page.getByLabel("English Choir").check();
  await next(page);
  await page.getByLabel(en.reg_phone_label).fill(phone);
  await next(page);
  await page.getByLabel(en.reg_adult_label).check();
  await page.getByLabel(en.reg_privacy_label).check();
  await page.getByLabel(en.reg_consent_label).check();
  await next(page);
  await expect(page.getByRole("heading", { name: en.reg_review_title })).toBeVisible();
  return phone;
}

test("registers a member: details, code, reference (FR-1)", async ({ page }) => {
  await fillDetails(page);
  // The test widget passes by itself; wait until it has added its token to the form.
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: en.reg_send_code }).click();

  await page.getByLabel(en.reg_code_label).fill("123456");
  await page.getByRole("button", { name: en.reg_verify }).click();
  await expect(page.getByText(en.err_code_wrong.replace("{count}", "4"))).toBeVisible();

  await page.getByLabel(en.reg_code_label).fill(TEST_CODE);
  await page.getByRole("button", { name: en.reg_verify }).click();
  // Storing it takes a few seconds against a remote test database; milliseconds in production.
  await expect(page.getByRole("heading", { name: en.reg_done_title })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/^REG-[2-9A-HJ-NP-Z]{5}$/)).toBeVisible();
});

test("keeps entered values through errors and the Back button", async ({ page }) => {
  await page.goto("/registration");
  await next(page);
  await expect(page.getByText(en.err_required)).toBeVisible();
  await page.getByLabel(en.reg_name_label).fill("Test Person");
  await next(page);
  await page.getByLabel(en.reg_fwo_label).fill("12a");
  await next(page);
  await expect(page.getByText(en.err_fwo_invalid)).toBeVisible();
  await expect(page.getByLabel(en.reg_fwo_label)).toHaveValue("12a");
  await page.getByRole("button", { name: en.reg_back }).click();
  await expect(page.getByLabel(en.reg_name_label)).toHaveValue("Test Person");
});

test("lets a new member register without an FWO number (BR-16)", async ({ page }) => {
  await page.goto("/registration");
  await page.getByLabel(en.reg_name_label).fill("Test Person");
  await next(page);
  await page.getByLabel(en.reg_new_member_label).check();
  await next(page);
  await expect(page.getByLabel(en.reg_hbc_label)).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every step works up to the code, which explains that it needs JavaScript", async ({
    page,
  }) => {
    await fillDetails(page);
    await expect(page.getByText(en.reg_js_needed)).toBeVisible();
    await page.getByRole("button", { name: en.reg_send_code }).click();
    await expect(page.getByText(en.err_turnstile)).toBeVisible();
  });
});

test.describe("on a first visit", () => {
  test("shows the form in Kiswahili", async ({ browser }) => {
    const context = await browser.newContext(); // no language cookie
    const page = await context.newPage();
    await page.goto("/registration");
    await expect(page.locator("html")).toHaveAttribute("lang", "sw");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.reg_title);
    await expect(page.getByLabel(sw.reg_name_label)).toBeVisible();
    await context.close();
  });
});

test("has no WCAG 2.2 AA violations on the first step and the review", async ({ page }) => {
  const scan = () =>
    new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude("iframe") // Turnstile's challenge frame is Cloudflare's
      .analyze();
  await page.goto("/registration");
  expect((await scan()).violations).toEqual([]);
  await fillDetails(page);
  expect((await scan()).violations).toEqual([]);
});

test("first load stays under 200 KB, and Turnstile loads only at the code step", async ({
  page,
}) => {
  // NFR-2. Turnstile itself is about 250 KB (Cloudflare's script and challenge frame), more than
  // the whole budget, so it isn't part of the first load: it loads on the review step, where the
  // code is sent (rule 8).
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
  await page.goto("/registration", { waitUntil: "networkidle" });
  await Promise.all(pending);
  page.off("requestfinished", count);
  expect(firstLoad).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
  expect(turnstileOnFirstLoad).toBe(0);
});
