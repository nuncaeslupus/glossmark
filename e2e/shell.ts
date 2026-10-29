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

// `?demo`: the README screenshot.
const demo = [
  "# Field notes on typesetting",
  "Markdown is a *writing* format. **Nacho Viewer** treats it as a *reading* one: every file opens as a page, set with care, ready to print.",
  "> [!TIP]\n> Open any `.md` file with Nacho Viewer and it reads like a finished document.",
  "## What a good page needs",
  "1. A comfortable measure, around 70 characters a line\n2. Generous leading and quiet headings\n3. ==Highlights== that survive printing",
  "| Element | Rendered as |\n| --- | --- |\n| Tables | Ruled, aligned columns |\n| Code | Highlighted, monospaced |\n| Math | Typeset with KaTeX |",
  "```js\nconst page = render(markdown);\nprint(page); // to PDF, as seen\n```",
  "Einstein's famous result, $E = mc^2$, sits inline with the text.",
].join("\n\n");

const params = new URLSearchParams(location.search);
const files: Record<string, string> = params.has("demo")
  ? { "/home/you/notes/README.md": "# Readme\n", "/home/you/notes/field-notes.md": demo }
  : params.has("big")
    ? {
        "/e2e/find.md": `[Other](other.md)\n\n${bigDocument(1024 * 1024)}`,
        "/e2e/other.md": "# Other\n\nA small document.\n",
      }
    : { "/e2e/find.md": doc };

const root = document.getElementById("app") as HTMLElement;
const { backend } = fakeBackend(files, params.has("demo") ? Object.keys(files) : ["/e2e/find.md"]);
void new Shell(root, backend).start();
