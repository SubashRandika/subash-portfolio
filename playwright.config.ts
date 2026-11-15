import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Which browser build drives the tests.
 *
 * Locally the default is the installed, signed Google Chrome ("chrome").
 * Playwright's own downloaded Chromium is an unsigned binary, which Windows
 * Application Control policies block on some machines (including the one this
 * project was developed on). CI uses Playwright's bundled Chromium.
 *
 * Override with PLAYWRIGHT_CHANNEL=msedge | chrome | bundled.
 */
const requestedChannel = process.env.PLAYWRIGHT_CHANNEL ?? (process.env.CI ? "bundled" : "chrome");
const channel = requestedChannel === "bundled" ? undefined : requestedChannel;

/**
 * End-to-end tests run against the production build so they exercise what
 * visitors actually receive.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium", channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SITE_URL: baseURL,
      // Reserved example values, so the populated contact section is tested.
      // The real details are configured at deployment.
      NEXT_PUBLIC_CONTACT_EMAIL: "hello@example.com",
      NEXT_PUBLIC_GITHUB_URL: "https://github.com/example",
    },
  },
});
