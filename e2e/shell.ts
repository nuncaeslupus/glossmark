// The window shell over the in-memory core, for Playwright: one document with three "needle"s
// a screen or more apart, or with `?big` a 1 MB document that links to a small one. Built
// only in `--mode e2e`, never into the app.
import { fakeBackend } from "../src/ui/fake-backend";
import { Shell } from "../src/ui/shell";
import { bigDocument } from "./big";

const filler = Array.from({ length: 40 }, (_, i) => `Filler paragraph ${i + 1}.`).join("\n\n");
const doc = [
  "# Find",
  "The first needle.",
  filler,
  "## Middle",
  "A second **needle**.",
  filler,
  "## End",
  "The third needle.",
].join("\n\n");

const files: Record<string, string> = new URLSearchParams(location.search).has("big")
  ? {
      "/e2e/find.md": `[Other](other.md)\n\n${bigDocument(1024 * 1024)}`,
      "/e2e/other.md": "# Other\n\nA small document.\n",
    }
  : { "/e2e/find.md": doc };

const root = document.getElementById("app") as HTMLElement;
const { backend } = fakeBackend(files, ["/e2e/find.md"]);
void new Shell(root, backend).start();
