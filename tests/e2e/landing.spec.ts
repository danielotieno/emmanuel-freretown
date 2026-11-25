import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import sw from "../../messages/sw.json" with { type: "json" };

const PAGE_WEIGHT_BUDGET_BYTES = 200 * 1024; // NFR-2

test("shows English on a first visit and remembers a switch to Kiswahili (#80)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.landing_welcome);
  await expect(page.getByRole("button", { name: en.language_en })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: sw.language_sw }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "sw");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.landing_welcome);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.landing_welcome);
});

test("links to registration with a plain link (Turnstile's CSP is per page load)", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: en.reg_title });
  await expect(link).toHaveAttribute("href", "/registration");
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.reg_title);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the language switch still works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: sw.language_sw }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.landing_welcome);
  });
});

test("has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("first load stays under 200 KB", async ({ page }) => {
  const sizes: Promise<number>[] = [];
  page.on("requestfinished", (request) => {
    sizes.push(request.sizes().then((s) => s.responseBodySize + s.responseHeadersSize));
  });
  await page.goto("/", { waitUntil: "networkidle" });
  const total = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
  expect(total).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
});

test("sends a nonce-based CSP and the page runs without violations", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");

  // Hydration must still work under the policy: switching language uses client JS.
  await page.getByRole("button", { name: sw.language_sw }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.landing_welcome);
  expect(violations).toEqual([]);
});

test("does not serve the staff portal on the public host", async ({ request }) => {
  expect((await request.get("/admin")).status()).toBe(404);
  expect((await request.get("/admin/anything")).status()).toBe(404);
});

test("serves the staff portal on the admin host", async ({ page, browserName, baseURL }) => {
  test.skip(browserName !== "chromium", "*.localhost resolves to loopback in Chromium");
  const adminURL = new URL(baseURL!);
  adminURL.hostname = `admin.${adminURL.hostname}`;
  await page.goto(adminURL.toString());
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Staff area");
});
