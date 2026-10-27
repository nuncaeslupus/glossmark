import { afterEach, describe, expect, it, vi } from "vitest";
import { strings } from "../strings";
import { matchesKey } from "./definition";
import { fakeBackend, gate, settle } from "./fake-backend";
import { Shell } from "./shell";

const shells: Shell[] = [];
afterEach(() => {
  for (const shell of shells.splice(0)) shell.dispose();
});

type FakeState = ReturnType<typeof fakeBackend>["state"];

async function open(
  files: Record<string, string>,
  launch: string[],
  setup: (state: FakeState) => void = () => {},
) {
  const fake = fakeBackend(files, launch);
  setup(fake.state);
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const shell = new Shell(root, fake.backend);
  shells.push(shell);
  await shell.start();
  return { root, shell, ...fake };
}

const notice = (root: Element) => root.querySelector(".bar .notice")?.textContent;
const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

function click(el: Element | null, init: MouseEventInit = {}): MouseEvent {
  const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  el?.dispatchEvent(e);
  return e;
}

describe("shell", () => {
  it("test_tab_renders_sanitised_document", async () => {
    const { root } = await open({ "/n/a.md": "# Hi\n\n<script>x()</script><b>ok</b>" }, [
      "/n/a.md",
    ]);
    const sheet = root.querySelector(".sheet");
    expect(sheet?.querySelector("h1")?.textContent).toBe("Hi");
    expect(sheet?.querySelector("script")).toBeNull();
    expect(sheet?.querySelector("b")?.textContent).toBe("ok");
    expect(root.querySelector(".bar .title")?.textContent).toBe("a.md");
    expect(root.querySelector<HTMLElement>("main.empty")?.hidden).toBe(true);
  });

  it("test_read_error_shows_in_sheet_not_dialog", async () => {
    const { root } = await open({}, ["/n/gone.md"]);
    const error = root.querySelector(".sheet .doc-error");
    expect(error?.textContent).toContain(strings.documentError);
    expect(error?.textContent).toContain("/n/gone.md: not found");
  });

  it("test_open_focuses_existing_tab_and_close_falls_back", async () => {
    const files = { "/n/a.md": "a", "/n/b.md": "b" };
    const { root, shell } = await open(files, ["/n/a.md", "/n/b.md"]);
    await shell.openPaths(["/n/a.md"]);
    expect(root.querySelectorAll(".tab")).toHaveLength(2);
    expect(root.querySelector(".tab.active .tab-label")?.textContent).toBe("a.md");

    click(root.querySelector(".tab.active .tab-close"));
    expect(root.querySelectorAll(".tab")).toHaveLength(1);
    expect(root.querySelector(".tab.active .tab-label")?.textContent).toBe("b.md");
    root.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "w", ctrlKey: true }));
    expect(root.querySelectorAll(".tab")).toHaveLength(0);
    expect(root.querySelector<HTMLElement>("main.empty")?.hidden).toBe(false);
  });

  it("test_recent_files_newest_first_and_capped", async () => {
    const files = Object.fromEntries([...Array(12).keys()].map((i) => [`/n/${i}.md`, "x"]));
    const { root, shell, state } = await open(files, []);
    for (let i = 0; i < 12; i++) await shell.openPaths([`/n/${i}.md`]);
    await shell.openPaths(["/n/5.md"]);
    await settle();
    expect(state.config.recentFiles).toHaveLength(10);
    expect(state.config.recentFiles.slice(0, 2)).toEqual(["/n/11.md", "/n/10.md"]);

    for (const close of root.querySelectorAll(".tab-close")) click(close);
    const recent = [...root.querySelectorAll(".recent-file")].map((b) => b.textContent);
    expect(recent[0]).toBe("11.md");
    click(root.querySelector(".recent-file"));
    await settle();
    expect(root.querySelector(".tab.active .tab-label")?.textContent).toBe("11.md");
  });

  it("test_file_open_menu_uses_core_dialog", async () => {
    const { root, state } = await open({ "/n/a.md": "# A" }, []);
    state.dialogPaths = ["/n/a.md"];
    const fileMenu = root.querySelector(".menu-button");
    click(fileMenu);
    expect(root.querySelector<HTMLElement>(".menu")?.hidden).toBe(false);
    click(root.querySelector('.menu-item[data-action="open"]'));
    await settle();
    expect(root.querySelector(".sheet h1")?.textContent).toBe("A");
    expect(root.querySelector<HTMLElement>(".menu")?.hidden).toBe(true);
  });

  it("test_links_never_navigate_the_webview", async () => {
    const md = '[ext](https://a.org/x) [here](#goal) [rel](other.md)\n\n<p id="goal">t</p>';
    const { root, state } = await open({ "/n/a.md": md }, ["/n/a.md"]);
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const links = root.querySelectorAll(".sheet a");

    const ext = click(links[0]);
    expect(ext.defaultPrevented).toBe(true);
    expect(state.external).toEqual(["https://a.org/x"]);

    expect(click(links[1]).defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(root.querySelector("#user-content-goal"));

    expect(click(links[2]).defaultPrevented).toBe(true);
    expect(state.external).toHaveLength(1);
  });

  it("test_dialog_failure_shows_notice_and_second_open_is_ignored", async () => {
    const { root, state } = await open({}, []);
    const pending = gate();
    state.readGate = pending.promise;
    state.fail.openDialog = { kind: "io", message: "no portal" };
    root.ownerDocument.dispatchEvent(key({ key: "o", ctrlKey: true }));
    root.ownerDocument.dispatchEvent(key({ key: "o", ctrlKey: true }));
    expect(state.dialogCalls).toBe(1);
    pending.open();
    await settle();
    expect(notice(root)).toBe(strings.notices.openFailed);
    expect(root.querySelectorAll(".tab")).toHaveLength(0);
  });

  it("test_config_failures_show_notice", async () => {
    const read = await open({ "/n/a.md": "a" }, ["/n/a.md"], (s) => {
      s.fail.getConfig = new Error("unreadable");
    });
    expect(notice(read.root)).toBe(strings.notices.settingsUnavailable);

    const save = await open({ "/n/a.md": "a" }, [], (s) => {
      s.fail.setConfig = new Error("read-only");
    });
    await save.shell.openPaths(["/n/a.md"]);
    await settle();
    expect(notice(save.root)).toBe(strings.notices.recentFilesNotSaved);
  });

  it("test_load_after_tab_closed_is_dropped", async () => {
    const { root, shell, state } = await open({ "/n/a.md": "# A", "/n/gone.md": "x" }, []);
    const pending = gate();
    state.readGate = pending.promise;
    const loading = shell.openPaths(["/n/a.md"]);
    const sheet = root.querySelector(".sheet");
    click(root.querySelector(".tab-close"));
    pending.open();
    await loading;
    await settle();
    expect(sheet?.childNodes).toHaveLength(0);
    expect(state.config.recentFiles).toEqual([]);
  });

  it("test_dispose_removes_listeners", async () => {
    const { root, shell, state } = await open({ "/n/a.md": "a" }, ["/n/a.md"]);
    shell.dispose();
    root.ownerDocument.dispatchEvent(key({ key: "w", ctrlKey: true }));
    state.emitOpenFiles(["/n/a.md", "/n/b.md"]);
    await settle();
    expect(root.querySelectorAll(".tab")).toHaveLength(1);
  });

  it("test_shortcut_modifiers_must_match", () => {
    expect(matchesKey("Ctrl+O", key({ key: "o", ctrlKey: true }))).toBe(true);
    expect(matchesKey("Ctrl+O", key({ key: "O", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesKey("Ctrl+O", key({ key: "o", ctrlKey: true, altKey: true }))).toBe(false);
    expect(matchesKey("Ctrl+O", key({ key: "o" }))).toBe(false);
    expect(matchesKey("Alt+ArrowLeft", key({ key: "ArrowLeft", altKey: true }))).toBe(true);
  });
});
