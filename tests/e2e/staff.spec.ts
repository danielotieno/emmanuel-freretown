import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The staff portal's front door (#17): routing by host, the sign-in page, and no auth
// endpoints on the public site. Signing in and setting up the authenticator app are covered
// against real Postgres in tests/integration/staff-auth.test.ts.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const ADMIN = `http://admin.localhost:${PORT}`;

test("the public site has no staff auth endpoints", async ({ request }) => {
  for (const path of ["/api/auth/get-session", "/admin/api/auth/get-session"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  const signIn = await request.post("/api/auth/sign-in/email", {
    data: { email: "nobody@example.org", password: "not-the-password" },
  });
  expect(signIn.status()).toBe(404);
});

test("the staff host sends a visitor to a sign-in page with no WCAG 2.2 AA violations", async ({
  page,
  browserName,
}) => {
  // Chromium resolves *.localhost itself; WebKit and Node need the system resolver, which
  // doesn't. The page is the same in every browser.
  test.skip(browserName !== "chromium", "admin.localhost resolves in Chromium only");
  await page.goto(`${ADMIN}/`);
  await expect(page).toHaveURL(`${ADMIN}/sign-in`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Staff sign-in");
  await expect(page.getByLabel("Email address")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
