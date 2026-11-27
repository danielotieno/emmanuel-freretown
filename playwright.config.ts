import { defineConfig, devices } from "@playwright/test";

// Not 3000, so a dev server for another project is never mistaken for this app.
const PORT = Number(process.env.E2E_PORT ?? 3100);

// Viewports from DESIGN.md §4.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub's runner had 2 vCPUs while the repository was private, so Playwright's default (half the
  // CPUs) was 1 worker. Much of each test waits on the server and Postgres, so 4 workers cut the
  // run by about 30% (#133). Public repositories get 4 vCPUs (since 27 Nov 2026, #146); 4 workers
  // still fit. Each staff test signs in as its own user from a random CF-Connecting-IP, so parallel
  // workers rarely share a rate-limit bucket. Locally, the default still applies.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "android-360",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "iphone-375", use: { ...devices["iPhone SE (3rd gen)"] } },
    {
      name: "tablet-768",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true },
    },
    {
      name: "laptop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  // A production build, so page weight is measured as members will receive it.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
