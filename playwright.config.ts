import { defineConfig, devices } from "@playwright/test";

// Not 3000, so a dev server for another project is never mistaken for this app.
const PORT = Number(process.env.E2E_PORT ?? 3100);

// Viewports from DESIGN.md §4.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
