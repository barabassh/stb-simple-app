import { defineConfig, devices } from "@playwright/test";

import { testDatabaseUrl } from "./tests/support/test-database";

// A server of its own on another port: the one started by `npm run dev` uses the developer's database.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // One dev server serves every worker: with eight of them requests queued long enough for WebKit
  // tests to time out, while four ran the whole suite three times faster.
  workers: 4,
  reporter: "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  // The dev server compiles a page on its first visit.
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // The engine of Safari, which docs/ТЗ.md (3.2) lists among the supported browsers.
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-360", testMatch: "login.spec.ts", use: { ...devices["Galaxy S8"] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { DATABASE_URL: testDatabaseUrl("e2e"), NEXT_DIST_DIR: ".next-e2e" },
  },
});
