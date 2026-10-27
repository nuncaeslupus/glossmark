import { afterEach, describe, expect, it, vi } from "vitest";
import { strings } from "../strings";
import { fakeBackend, gate, settle } from "./fake-backend";
import { Shell } from "./shell";

// ponytail: the plan puts this in e2e/reload.spec.ts (Playwright WebKit), which the repo does
// not have yet; jsdom has no layout, so a fake one stands in: each top-level block of the sheet
// is LINE px tall and the canvas is SCREEN px high.
const LINE = 40;
const SCREEN = 600;

const shells: Shell[] = [];
afterEach(() => {
  for (const shell of shells.splice(0)) shell.dispose();
  vi.restoreAllMocks();
});

async function open(files: Record<string, string>, launch: string[]) {
  const fake = fakeBackend(files, launch);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const shell = new Shell(root, fake.backend);
  shells.push(shell);
  await shell.start();
  await settle();
  return { root, shell, ...fake };
}

/** Gives every canvas a scroll offset, and every block a top from its place in the sheet. */
function fakeLayout() {
  const offsets = new WeakMap<Element, number>();
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function (this: Element) {
    return offsets.get(this) ?? 0;
  });
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function (
    this: Element,
    value: number,
  ) {
    offsets.set(this, Math.max(0, value));
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const canvas = this.closest(".canvas");
    let top = 0;
    if (canvas && canvas !== this) {
      let block: Element = this;
      while (block.parentElement && !block.parentElement.classList.contains("sheet")) {
        block = block.parentElement;
      }
      const sheet = block.parentElement;
      top = (sheet ? [...sheet.children].indexOf(block) : 0) * LINE - canvas.scrollTop;
    }
    return new DOMRect(0, top, 100, LINE);
  });
}

const sections = (names: string[]) =>
  names.map((n) => `## ${n}\n\n${n} one.\n\n${n} two.\n\n${n} three.`).join("\n\n");

const heading = (root: Element, text: string) =>
  [...root.querySelectorAll<HTMLElement>(".sheet h2")].find((h) => h.textContent === text);

async function until(done: () => boolean) {
  for (let i = 0; i < 100 && !done(); i++) await settle();
  expect(done()).toBe(true);
}

describe("live reload", () => {
  it("test_live_reload_after_save_updates_and_keeps_scroll", async () => {
    fakeLayout();
    const names = [..."ABCDEFGHIJKLMNOP"];
    const { root, state } = await open({ "/n/a.md": sections(names) }, ["/n/a.md"]);
    const canvas = root.querySelector<HTMLElement>(".canvas");
    if (!canvas) throw new Error("no canvas");
    const h = heading(root, "H");
    if (!h) throw new Error("no heading");
    // Two blocks into section H.
    canvas.scrollTop = h.getBoundingClientRect().top + canvas.scrollTop + 2 * LINE;
    const before = canvas.scrollTop;
    const where = h.getBoundingClientRect().top;

    // The other editor adds a paragraph above the reader and edits the one being read.
    const edited = sections(names)
      .replace("B one.", "B one.\n\nAdded above.")
      .replace("H two.", "H two, edited.");
    const saved = performance.now();
    state.write("/n/a.md", edited);
    await until(
      () => root.querySelector(".sheet")?.textContent?.includes("H two, edited") ?? false,
    );
    const elapsed = performance.now() - saved;
    console.log(`live_reload_ms frontend share: ${Math.round(elapsed)}`);
    // The core's 100 ms debounce and event are measured in watch.rs; together within 500 ms.
    expect(elapsed).toBeLessThanOrEqual(150);

    expect(root.querySelector(".sheet")?.textContent).toContain("Added above.");
    expect(heading(root, "H")?.getBoundingClientRect().top).toBe(where);
    expect(Math.abs(canvas.scrollTop - before)).toBeLessThan(SCREEN);
    expect(canvas.scrollTop).not.toBe(before);
  });

  it("test_deleted_file_keeps_last_version_with_notice", async () => {
    const { root, state } = await open({ "/n/a.md": "# A\n\nkept" }, ["/n/a.md"]);
    state.remove("/n/a.md");
    await settle();
    const sheet = root.querySelector(".sheet");
    expect(sheet?.querySelector(".file-notice")?.textContent).toBe(strings.fileNotices.deleted);
    expect(sheet?.querySelector("h1")?.textContent).toBe("A");
    expect(root.querySelector(".bar .notice")?.textContent).toBe("");

    // The file comes back: its version replaces the sheet and the notice.
    state.write("/n/a.md", "# Back");
    await settle();
    expect(sheet?.querySelector("h1")?.textContent).toBe("Back");
    expect(sheet?.querySelector(".file-notice")).toBeNull();
  });

  it("test_save_with_equal_mtime_reloads", async () => {
    // Coarse-mtime filesystems give two quick saves the same mtime.
    const { root, state } = await open({ "/n/a.md": "# A" }, ["/n/a.md"]);
    state.write("/n/a.md", "# B", 5000);
    await settle();
    state.write("/n/a.md", "# C", 5000);
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("C");
  });

  it("test_replacement_with_older_mtime_reloads", async () => {
    // `cp -p`, rsync or a restore puts back a file older than the one shown.
    const { root, state } = await open({ "/n/a.md": "# New" }, ["/n/a.md"]);
    state.write("/n/a.md", "# Newer", 9000);
    await settle();
    state.write("/n/a.md", "# Restored", 1);
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("Restored");
  });

  it("test_overtaken_reload_is_dropped_and_other_paths_ignored", async () => {
    const { root, state } = await open({ "/n/a.md": "# A" }, ["/n/a.md"]);
    // The first reload's read is slow and returns the older text after the second one.
    const slow = gate();
    state.nextReadWaits = slow.promise;
    state.write("/n/a.md", "# B");
    state.write("/n/a.md", "# C");
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("C");
    slow.open();
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("C");

    const reads = state.reads;
    state.emitDocumentChanged({ path: "/n/other.md", mtime_ms: 1 });
    await settle();
    expect(state.reads).toBe(reads);
  });

  it("test_failed_reload_keeps_sheet_with_notice", async () => {
    const { root, state } = await open({ "/n/a.md": "# A" }, ["/n/a.md"]);
    state.readGate = Promise.reject({ kind: "io", message: "busy" });
    state.readGate.catch(() => {});
    state.emitDocumentChanged({ path: "/n/a.md", mtime_ms: 1 });
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("A");
    expect(root.querySelector(".sheet .file-notice")?.textContent).toBe(
      strings.fileNotices.reloadFailed,
    );
  });

  it("test_watch_follows_navigation", async () => {
    const files = { "/n/a.md": "# A\n\n[to b](b.md)", "/n/b.md": "# B" };
    const { root, state } = await open(files, ["/n/a.md"]);
    root
      .querySelector('.sheet a[href="b.md"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("B");
    expect(state.watched).toEqual({ "/n/a.md": 0, "/n/b.md": 1 });

    // A save to the file the tab left does not touch it; one to the file it shows does.
    const reads = state.reads;
    state.emitDocumentChanged({ path: "/n/a.md", mtime_ms: 1 });
    await settle();
    expect(state.reads).toBe(reads);
    state.write("/n/b.md", "# B2");
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("B2");

    const back = new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true });
    root.ownerDocument.dispatchEvent(back);
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("A");
    expect(state.watched).toEqual({ "/n/a.md": 1, "/n/b.md": 0 });
  });

  it("test_tab_watches_while_open_and_unwatches_on_close", async () => {
    const files = { "/n/a.md": "a", "/n/b.md": "b" };
    const { root, shell, state } = await open(files, ["/n/a.md", "/n/b.md"]);
    expect(state.watched).toEqual({ "/n/a.md": 1, "/n/b.md": 1 });
    root.querySelector<HTMLElement>(".tab-close")?.click();
    await settle();
    expect(state.watched).toEqual({ "/n/a.md": 0, "/n/b.md": 1 });

    // A missing file is not watched; dispose ends the rest.
    await shell.openPaths(["/n/gone.md"]);
    await settle();
    expect(state.watched["/n/gone.md"]).toBeUndefined();
    shell.dispose();
    await settle();
    expect(state.watched["/n/b.md"]).toBe(0);
  });

  it("test_failed_watch_shows_notice_and_is_never_unwatched", async () => {
    const files = { "/n/a.md": "a" };
    const { root, shell, state } = await open(files, []);
    state.unwatchable = ["/n/a.md"];
    await shell.openPaths(["/n/a.md"]);
    await settle();
    expect(root.querySelector(".bar .notice")?.textContent).toBe(strings.notices.watchFailed);
    root.querySelector<HTMLElement>(".tab-close")?.click();
    await settle();
    expect(state.unwatchCalls).toBe(0);
  });
});
