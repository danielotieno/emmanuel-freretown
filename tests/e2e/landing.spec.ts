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

test("each language button has a tap area of at least 44 × 44 px (#80)", async ({ page }) => {
  await page.goto("/");
  for (const name of [en.language_en, sw.language_sw]) {
    const button = page.getByRole("button", { name });
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    // The pill is drawn 32px tall; the tap area reaches 6px above and below it.
    const hits = await button.evaluate((el, b) => {
      const x = b.x + b.width / 2;
      return [b.y - 5, b.y + b.height + 5].every((y) => document.elementFromPoint(x, y) === el);
    }, box);
    expect(hits).toBe(true);
    expect(box.height + 12).toBeGreaterThanOrEqual(44);
  }
});

test("links to registration with a plain link (Turnstile's CSP is per page load)", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: en.reg_title }).first();
  await expect(link).toHaveAttribute("href", "/registration");
  // A client-side navigation (<Link>) would fetch no new document and keep the landing page's
  // policy, which blocks Turnstile: so require a document load that carries Turnstile's policy.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().resourceType() === "document" && new URL(r.url()).pathname === "/registration",
    ),
    link.click(),
  ]);
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-src https://challenges.cloudflare.com",
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.reg_title);
});

test("the Register link shows at once that the next page is loading (#96)", async ({ page }) => {
  await page.goto("/");
  // Cancel the navigation after the link has handled the click (a window listener runs last), so
  // the busy state can be read on this page. The plain-link test above covers the page load.
  await page.evaluate(() => window.addEventListener("click", (event) => event.preventDefault()));
  const link = page.getByRole("link", { name: en.nav_register, exact: true });
  await link.click();
  await expect(link).toHaveAttribute("aria-busy", "true");
});

test("the language switch shows at once that it is working (#96)", async ({ page }) => {
  await page.goto("/");
  // Hold the switch's post (a server action on this page).
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.fallback();
  });
  const button = page.getByRole("button", { name: sw.language_sw });
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  release();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(sw.landing_welcome);
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

test("first load stays under 200 KB, plus the hero photo and later photos within their caps (D46)", async ({
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
  await page.goto("/", { waitUntil: "networkidle" });
  const sum = async (sizes: Promise<number>[]) =>
    (await Promise.all(sizes)).reduce((total, size) => total + size, 0);
  expect(await sum(rest)).toBeLessThan(PAGE_WEIGHT_BUDGET_BYTES);

  // Exactly one hero photo, sized for the screen: phones get the small one at any pixel density.
  expect(hero).toHaveLength(1);
  const width = page.viewportSize()!.width;
  const cap = width <= 600 ? 35 * 1024 : width <= 1100 ? 60 * 1024 : 110 * 1024;
  expect(await sum(hero)).toBeLessThan(cap);

  // Photos further down load only as the reader nears them, and each stays small.
  for (const size of await Promise.all(later)) expect(size).toBeLessThan(50 * 1024);
  const eager = await page.locator("main img:not([loading=lazy])").count();
  expect(eager).toBe(1);
});

test("the navigation reaches the About page, every section and registration", async ({ page }) => {
  await page.goto("/");
  // About is its own page; the other links go to the homepage's sections.
  await expect(
    page.getByRole("navigation", { name: en.nav_label }).getByRole("link", { name: en.nav_about }),
  ).toHaveAttribute("href", "/about");
  for (const [label, id] of [
    [en.nav_services, "services"],
    [en.nav_ministries, "ministries"],
    [en.nav_visit, "visit"],
  ] as const) {
    const link = page.getByRole("navigation", { name: en.nav_label }).getByRole("link", {
      name: label,
    });
    await expect(link).toHaveAttribute("href", `/#${id}`);
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
  // A plain link (not client-side navigation): Turnstile's CSP is set per page load.
  await expect(page.getByRole("link", { name: en.nav_register, exact: true })).toHaveAttribute(
    "href",
    "/registration",
  );
});

for (const [locale, messages] of [
  ["en", en],
  ["sw", sw],
] as const) {
  test(`every navigation link is on screen, without scrolling sideways (${locale})`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/");
    const width = page.viewportSize()!.width;
    // The visible navigation: the phone row below md, the bar beside the lockup from md.
    const nav = page
      .getByRole("navigation", { name: messages.nav_label })
      .filter({ visible: true });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(width < 900 ? 5 : 4);
    for (const link of await links.all()) {
      const box = (await link.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    const register = page.getByRole("link", { name: messages.nav_register, exact: true });
    await expect(register).toBeInViewport({ ratio: 1 });
  });
}

for (const [locale, messages] of [
  ["en", en],
  ["sw", sw],
] as const) {
  test(`every Sunday time range stays on one line, without scrolling sideways (#96, ${locale})`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "PARAGLIDE_LOCALE", value: locale, url: baseURL! }]);
    await page.goto("/");
    for (const time of [
      messages.home_time_english1,
      messages.home_time_english2,
      messages.home_time_kiswahili,
      messages.home_time_revival,
    ]) {
      const fit = await page
        .locator("#services")
        .getByText(time, { exact: true })
        .evaluate((el) => ({
          lines: el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight),
          clipped: el.scrollWidth > el.clientWidth,
        }));
      expect(fit.lines).toBeLessThan(1.5);
      expect(fit.clipped).toBe(false);
    }
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
}

test("shows service times, the theme of the year and the HBCs from the register", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText(en.home_time_kiswahili)).toBeVisible();
  await expect(page.getByRole("heading", { name: en.home_theme_title })).toBeVisible();
  await expect(page.locator("#hbcs").getByText("Judea", { exact: true })).toBeVisible();
});

test("each part of the homepage is a section of its own", async ({ page }) => {
  await page.goto("/");
  for (const title of [
    en.home_services_title,
    en.home_week_title,
    en.home_theme_title,
    en.home_ministries_title,
    en.home_hbc_title,
    en.home_visit_title,
  ]) {
    await expect(page.getByRole("region", { name: title })).toHaveCount(1);
  }
});

test("each ministry shows its verse written out, with its reference", async ({ page }) => {
  await page.goto("/");
  const ministries = page.locator("#ministries");
  for (const [verse, reference] of [
    [en.home_verse_kama_text, en.home_verse_kama],
    [en.home_verse_mu_text, en.home_verse_mu],
    [en.home_verse_kayo_text, en.home_verse_kayo],
    [en.home_verse_children_text, en.home_verse_children],
  ] as const) {
    await expect(ministries.getByText(verse)).toBeVisible();
    await expect(ministries.getByText(reference, { exact: true })).toBeVisible();
  }
});

test("says members vote in church elections, not only their HBC's", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(en.home_register_body)).toBeVisible();
  expect(en.home_register_body + en.landing_step3_body + en.reg_intro).not.toMatch(/HBC/);
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
  // Without a session the staff home redirects to sign-in (#17).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Staff sign-in");
});
