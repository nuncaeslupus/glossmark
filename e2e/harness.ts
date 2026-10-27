// The render pipeline without the Tauri shell, for Playwright: parse → sanitise → insert →
// enhance, into `#doc`. Built only in `--mode e2e`, never into the app.
import fixture from "../docs/fixtures/all-features.md?raw";
import { enhance } from "../src/render/enhance";
import { render } from "../src/render/pipeline";
import { sanitize } from "../src/render/sanitize";

declare global {
  interface Window {
    harness: { fixture: string; show(source: string): Promise<void> };
  }
}

window.harness = {
  fixture,
  async show(source) {
    const doc = document.getElementById("doc") as HTMLElement;
    doc.innerHTML = sanitize(render(source));
    await enhance(doc).ready;
  },
};
