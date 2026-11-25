import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import sw from "../../messages/sw.json" with { type: "json" };

// The privacy notice, terms and cookies pages (#27, NFR-10).

const PAGE_WEIGHT_BUDGET_BYTES = 200 * 1024; // NFR-2
const PAGES = [
  { path: "/privacy", title: en.privacy_title },
  { path: "/terms", title: en.terms_title },
  { path: "/cookies", title: en.cookies_title },
];

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: "en", url: "http://localhost" }]);
});

test("every public page links the privacy notice, terms and cookies", async ({ page }) => {
  for (const path of ["/", "/privacy"]) {
    await page.goto(path);
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: en.footer_privacy })).toHaveAttribute(
      "href",
      "/privacy",
    );
    await expect(footer.getByRole("link", { name: en.footer_terms })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(footer.getByRole("link", { name: en.footer_cookies })).toHaveAttribute(
      "href",
      "/cookies",
    );
  }
});

for (const { path, title } of PAGES) {
  test(`${path} shows its version, has no WCAG 2.2 AA violations and stays under 200 KB`, async ({
    page,
  }) => {
    const sizes: Promise<number>[] = [];
    page.on("requestfinished", (request) => {
      sizes.push(request.sizes().then((s) => s.responseBodySize + s.responseHeadersSize));
    });
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText(/^Version \d{4}-\d{2}-\d{2}$/)).toBeVisible();
    const total = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
    expect(total).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}

test("in Kiswahili, says the page is in English and where to ask (D44)", async ({ browser }) => {
  const context = await browser.newContext(); // first visit: Kiswahili
  const page = await context.newPage();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.privacy_title);
  await expect(page.getByText(sw.legal_english_only)).toBeVisible();
  await context.close();
});

test("the privacy notice says where data is kept and names the companies that process it", async ({
  page,
}) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: en.privacy_where_heading })).toBeVisible();
  for (const processor of ["Neon", "Cloudflare", "Mobile Sasa", "Sentry", "GitHub"]) {
    await expect(page.getByText(new RegExp(`^${processor}`)).first()).toBeVisible();
  }
});
