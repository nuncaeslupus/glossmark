// The shell over the in-memory core with the all-features fixture open, styled as the app is.
// `?theme=light|dark` is the saved View › Theme; without it, System. Built only in `--mode e2e`.
import fixture from "../docs/fixtures/all-features.md?raw";
import svg from "../docs/fixtures/currentcolor.svg?raw";
import { fakeBackend } from "../src/ui/fake-backend";
import type { Config } from "../src/ui/ipc";
import { Shell } from "../src/ui/shell";

const DOC = "/fixtures/all-features.md";
const theme = new URLSearchParams(location.search).get("theme") ?? "system";
const { backend, state } = fakeBackend({ [DOC]: fixture, "/fixtures/currentcolor.svg": svg }, [
  DOC,
]);
state.config.theme = theme as Config["theme"];
void new Shell(document.getElementById("app") as HTMLElement, backend).start();
