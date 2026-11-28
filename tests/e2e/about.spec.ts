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

test("has no WCAG 2.2 AA violations", async ({ page }) => {
  await page.goto("/about");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
