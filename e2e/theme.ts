// The shell over the in-memory core with the all-features fixture open, styled as the app is.
// `?theme=light|dark` is the saved View › Theme; without it, System. `&far` adds a second
// diagram far below the first. Built only in `--mode e2e`.
import fixture from "../docs/fixtures/all-features.md?raw";
import svg from "../docs/fixtures/currentcolor.svg?raw";
import { fakeBackend } from "../src/ui/fake-backend";
import type { Config } from "../src/ui/ipc";
import { Shell } from "../src/ui/shell";

const DOC = "/fixtures/all-features.md";
const params = new URLSearchParams(location.search);
const theme = params.get("theme") ?? "system";
const filler = Array.from({ length: 200 }, (_, i) => `Filler paragraph ${i + 1}.`).join("\n\n");
const far = "```mermaid\ngraph LR\n  Far --> Below\n```\n";
const text = params.has("far") ? `${fixture}\n\n${filler}\n\n${far}` : fixture;
const { backend, state } = fakeBackend({ [DOC]: text, "/fixtures/currentcolor.svg": svg }, [DOC]);
state.config.theme = theme as Config["theme"];
void new Shell(document.getElementById("app") as HTMLElement, backend).start();
