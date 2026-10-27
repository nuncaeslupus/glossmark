/// <reference types="node" />
import { existsSync } from "node:fs";
import { defineConfig, devices, webkit } from "@playwright/test";

const port = 4317;

// WebKit stands in for the app's WebKitGTK webview and always runs in CI. Locally it is
// skipped, loudly, when Playwright's WebKit build is not installed.
const webkitMissing = !process.env.CI && !existsSync(webkit.executablePath());
if (webkitMissing && !process.env.TEST_WORKER_INDEX) {
  console.warn(
    "\n*** WebKit SKIPPED: Playwright's WebKit is not installed; Chromium only. " +
      "Run `npx playwright install webkit` to include it. ***\n",
  );
}

export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(webkitMissing ? [] : [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]),
  ],
  webServer: {
    command: "npm exec -- vite build --mode e2e && npm exec -- vite preview --mode e2e",
    url: `http://localhost:${port}/e2e/harness.html`,
    // Never another worktree's server on the same port, built from other code.
    reuseExistingServer: false,
  },
});
