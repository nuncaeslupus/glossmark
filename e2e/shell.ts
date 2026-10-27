// The window shell over the in-memory core, for Playwright: one document with three "needle"s
// a screen or more apart. Built only in `--mode e2e`, never into the app.
import { fakeBackend } from "../src/ui/fake-backend";
import { Shell } from "../src/ui/shell";

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

const root = document.getElementById("app") as HTMLElement;
const { backend } = fakeBackend({ "/e2e/find.md": doc }, ["/e2e/find.md"]);
void new Shell(root, backend).start();
