import { defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and its own error output left on screen.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  test: { environment: "jsdom" },
});
