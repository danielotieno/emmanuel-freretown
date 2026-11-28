import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };

test("tells the church's history on a page of its own", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.about_title);
  for (const title of [
    en.about_story_title,
    en.about_timeline_title,
    en.about_bell_title,
    en.about_building_title,
    en.about_today_title,
    en.about_values_title,
    en.about_believe_title,
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
  const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("the header marks About as the current page and leads back to Sunday services", async ({
  page,
}) => {
  await page.goto("/about");
  const about = page
    .getByRole("navigation", { name: en.nav_label })
    .filter({ visible: true })
    .getByRole("link", { name: en.nav_about });
  await expect(about).toHaveAttribute("aria-current", "page");
  await page.getByRole("main").getByRole("link", { name: en.home_services_title }).click();
  await expect(page).toHaveURL(/\/#services$/);
  await expect(page.getByRole("heading", { level: 2, name: en.home_services_title })).toBeVisible();
});

test("first load stays under 200 KB, plus the first photo and later photos within their caps (D46)", async ({
  page,
}) => {
  const rest: Promise<number>[] = [];
  const hero: Promise<number>[] = [];
  const later: Promise<number>[] = [];
  page.on("requestfinished", (request) => {
    const size = request.sizes().then((s) => s.responseBodySize + s.responseHeadersSize);
    const url = request.url();
    if (/\/_next\/static\/media\/church-/.test(url)) hero.push(size);
    else if (/\/_next\/static\/media\/[^/]+\.webp/.test(url) && !/crest/.test(url))
      later.push(size);
    else rest.push(size);
  });
  await page.goto("/about", { waitUntil: "networkidle" });
  const sum = async (sizes: Promise<number>[]) =>
    (await Promise.all(sizes)).reduce((total, size) => total + size, 0);
  expect(await sum(rest)).toBeLessThan(200 * 1024); // NFR-2

  expect(hero).toHaveLength(1);
  const width = page.viewportSize()!.width;
  const cap = width <= 600 ? 35 * 1024 : width <= 1100 ? 60 * 1024 : 110 * 1024;
  expect(await sum(hero)).toBeLessThan(cap);

  for (const size of await Promise.all(later)) expect(size).toBeLessThan(50 * 1024);
  expect(await page.locator("main img:not([loading=lazy])").count()).toBe(1);
});

test("has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/about");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
