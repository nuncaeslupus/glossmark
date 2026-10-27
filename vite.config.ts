import { configDefaults, defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and its own error output left on screen.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  test: {
    environment: "jsdom",
    // Other worktrees live under .claude/; e2e/ is Playwright's.
    exclude: [...configDefaults.exclude, ".claude/**", "e2e/**"],
  },
});
