import { configDefaults, defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and its own error output left on screen. `--mode e2e` builds
// the Playwright harness page instead of the app.
export default defineConfig(({ mode }) => ({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  ...(mode === "e2e" && {
    build: {
      outDir: "dist-e2e",
      rollupOptions: { input: ["e2e/harness.html", "e2e/shell.html"] },
    },
    preview: { port: 4317, strictPort: true },
  }),
  test: { environment: "jsdom", exclude: [...configDefaults.exclude, "e2e/**", ".claude/**"] },
}));
