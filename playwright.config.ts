import { defineConfig, devices } from "@playwright/test";

const port = 4317;

// ponytail: Chromium only; Playwright's WebKit build cannot be downloaded in the sandbox,
// so the WebKitGTK-specific checks are left to a machine that has it.
export default defineConfig({
  testDir: "e2e",
  reporter: "list",
  use: { baseURL: `http://localhost:${port}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm exec -- vite build --mode e2e && npm exec -- vite preview --mode e2e",
    url: `http://localhost:${port}/e2e/harness.html`,
    // Never another worktree's server on the same port, built from other code.
    reuseExistingServer: false,
  },
});
