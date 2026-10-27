import { describe, expect, it } from "vitest";
import { strings } from "./strings";
import { fakeBackend, settle } from "./ui/fake-backend";
import { Shell } from "./ui/shell";

function stringValues(node: unknown): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "object" && node !== null) return Object.values(node).flatMap(stringValues);
  return [];
}

/** Every piece of UI text in the window: text and labels, minus the user's own content. */
function uiText(el: Element, out: string[] = []): string[] {
  if (el.hasAttribute("data-user")) return out;
  // A rendered document is content; only the error box in a sheet is ours.
  if (el.parentElement?.classList.contains("sheet") && !el.classList.contains("doc-error")) {
    return out;
  }
  for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
    const value = el.getAttribute(attr);
    if (value) out.push(value);
  }
  for (const child of el.childNodes) {
    if (child instanceof Element) uiText(child, out);
    else if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      out.push(child.textContent.trim());
    }
  }
  return out;
}

describe("strings (D-14)", () => {
  it("test_strings_all_ui_text_from_strings_file", async () => {
    // The zoom readout is the one string built by a function at a fixed value until T13.
    const allowed = new Set([...stringValues(strings), strings.zoomPercent(100)]);
    const { backend, state } = fakeBackend({ "/n/a.md": "# A\n\n[x](https://a.org)" });
    state.config.recentFiles = ["/n/old.md"];

    // The empty state with recent files.
    const empty = document.createElement("div");
    const emptyShell = new Shell(empty, backend);
    await emptyShell.start();
    expect(empty.querySelector(".recent")).not.toBeNull();

    // Two tabs, one that failed to load, with every menu open.
    const reading = document.createElement("div");
    const shell = new Shell(reading, backend);
    state.fail.setConfig = new Error("read-only");
    await shell.start();
    await shell.openPaths(["/n/a.md", "/n/missing.md"]);
    await settle();
    expect(reading.querySelector(".doc-error")).not.toBeNull();
    expect(reading.querySelector(".notice")?.textContent).toBe(strings.notices.recentFilesNotSaved);
    for (const menu of reading.querySelectorAll<HTMLElement>(".menu")) menu.hidden = false;
    expect(document.title).toBe(strings.windowTitle("missing.md"));

    const texts = [...uiText(empty), ...uiText(reading)];
    expect(texts.length).toBeGreaterThan(20);
    expect(texts.filter((t) => !allowed.has(t))).toEqual([]);
    emptyShell.dispose();
    shell.dispose();

    // No UI text is written into the code as a literal.
    const code: Record<string, string> = import.meta.glob(["./ui/*.ts", "!./ui/*.test.ts"], {
      query: "?raw",
      import: "default",
      eager: true,
    });
    const literal = /(textContent|title|innerText|placeholder)\s*=\s*["'`]|aria-label",\s*["'`]/;
    expect(Object.keys(code).filter((f) => literal.test(code[f]))).toEqual([]);
  });
});
