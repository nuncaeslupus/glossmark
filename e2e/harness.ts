// The render pipeline without the Tauri shell, for Playwright: parse → sanitise → insert →
// enhance, into `#doc`. `app` starts the real shell on the in-memory core instead. Built only
// in `--mode e2e`, never into the app.
import fixture from "../docs/fixtures/all-features.md?raw";
import { enhance } from "../src/render/enhance";
import { render } from "../src/render/pipeline";
import { sanitize } from "../src/render/sanitize";
import { fakeBackend } from "../src/ui/fake-backend";
import type { Config } from "../src/ui/ipc";
import { Shell } from "../src/ui/shell";

declare global {
  interface Window {
    harness: {
      fixture: string;
      show(source: string): Promise<void>;
      app(files: Record<string, string>, launch: string[], config?: Partial<Config>): Promise<void>;
    };
  }
}

window.harness = {
  fixture,
  async show(source) {
    const doc = document.getElementById("doc") as HTMLElement;
    doc.innerHTML = sanitize(render(source));
    await enhance(doc).ready;
  },
  async app(files, launch, config = {}) {
    const { backend, state } = fakeBackend(files, launch);
    state.config = { ...state.config, ...config };
    await new Shell(document.getElementById("doc") as HTMLElement, backend).start();
  },
};
