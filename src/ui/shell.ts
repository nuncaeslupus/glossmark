import { render } from "../render/pipeline";
import { sanitize } from "../render/sanitize";
import { strings } from "../strings";
import { type ActionId, actions, bar, matchesKey, menus } from "./definition";
import { type Backend, type Config, errorMessage } from "./ipc";

const MAX_RECENT_FILES = 10;
const NOTICE_MS = 6000;

interface Tab {
  path: string;
  /** The tab's entry in the tab strip. */
  handle: HTMLElement;
  /** The grey canvas that scrolls; each tab keeps its own, so switching keeps the scroll. */
  canvas: HTMLElement;
  sheet: HTMLElement;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Text that comes from the user's files, not from `strings` (file names, paths, errors). */
function userText<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string) {
  const node = h(tag, className, text);
  node.dataset.user = "";
  return node;
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** The window: tab strip, the slim bar, and the tabs' sheets or the empty state. */
export class Shell {
  private tabs: Tab[] = [];
  private active: Tab | null = null;
  private config: Config | null = null;
  private readonly tabStrip = h("nav", "tabs");
  private readonly view = h("div", "view");
  private readonly empty = h("main", "empty");
  private readonly title = userText("span", "title", "");
  private readonly menuBar = h("div", "menus");
  private readonly notice = h("span", "notice");
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private dialogOpen = false;
  private disposed = false;
  private readonly listeners = new AbortController();
  private unlisten: () => void = () => {};

  // Actions without a handler are drawn disabled until their task lands (T12, T13).
  private readonly handlers: Partial<Record<ActionId, () => void>> = {
    open: () => void this.openDialog(),
    print: () => window.print(),
    closeTab: () => this.active && this.close(this.active),
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly backend: Backend,
  ) {
    this.tabStrip.setAttribute("role", "tablist");
    this.view.append(this.empty);
    root.replaceChildren(this.tabStrip, this.buildBar(), this.view);
    this.notice.setAttribute("role", "status");
    const signal = this.listeners.signal;
    this.view.addEventListener("click", (e) => this.onLinkClick(e), { signal });
    this.view.addEventListener("auxclick", (e) => this.onLinkClick(e), { signal });
    const doc = root.ownerDocument;
    doc.addEventListener("keydown", (e) => this.onKey(e), { signal });
    const outside = (e: Event) => {
      if (!(e.target instanceof Element && this.menuBar.contains(e.target))) this.closeMenus();
    };
    doc.addEventListener("click", outside, { signal });
    this.update();
  }

  /** Listens for `open-files` first, so a second launch during startup is not lost. */
  async start(): Promise<void> {
    const unlisten = await this.backend.onOpenFiles((paths) => {
      if (!this.disposed) void this.openPaths(paths);
    });
    if (this.disposed) unlisten();
    else this.unlisten = unlisten;
    this.config = await this.backend.getConfig().catch(() => {
      this.show(strings.notices.settingsUnavailable);
      return null;
    });
    this.update();
    await this.openPaths(await this.backend.takeOpenFiles());
  }

  /** Removes the window's listeners; the shell does nothing afterwards. */
  dispose(): void {
    this.disposed = true;
    this.listeners.abort();
    this.unlisten();
    clearTimeout(this.noticeTimer);
  }

  /** A one-line message in the bar that fades on its own: never a dialog (D-11). */
  private show(message: string): void {
    this.notice.textContent = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice.replaceChildren();
    }, NOTICE_MS);
  }

  /** Opens each path in a new tab, or focuses its tab; the last one becomes active. */
  async openPaths(paths: string[]): Promise<void> {
    const added: Tab[] = [];
    let last: Tab | undefined;
    for (const path of paths) {
      last = this.tabs.find((t) => t.path === path);
      if (!last) {
        last = this.addTab(path);
        added.push(last);
      }
    }
    if (last) this.activate(last);
    await Promise.all(added.map((t) => this.load(t)));
  }

  private async openDialog(): Promise<void> {
    // A second Ctrl+O while the dialog is up does nothing.
    if (this.dialogOpen) return;
    this.dialogOpen = true;
    let paths: string[] = [];
    try {
      paths = await this.backend.openDialog();
    } catch {
      this.show(strings.notices.openFailed);
    } finally {
      this.dialogOpen = false;
    }
    await this.openPaths(paths);
  }

  /** `read_document` → render → sanitise → insert. Errors stay in the sheet, never a dialog. */
  private async load(tab: Tab): Promise<void> {
    // A tab closed while its read was in flight takes no result.
    const open = () => !this.disposed && this.tabs.includes(tab);
    try {
      const doc = await this.backend.readDocument(tab.path);
      if (!open()) return;
      tab.sheet.innerHTML = sanitize(render(doc.text));
      this.remember(doc.path);
    } catch (err) {
      if (!open()) return;
      const box = h("div", "doc-error");
      box.append(h("p", "", strings.documentError), userText("p", "", errorMessage(err)));
      tab.sheet.replaceChildren(box);
    }
  }

  private remember(path: string): void {
    if (!this.config) return;
    const recent = [path, ...this.config.recentFiles.filter((p) => p !== path)];
    this.config = { ...this.config, recentFiles: recent.slice(0, MAX_RECENT_FILES) };
    void this.backend
      .setConfig(this.config)
      .catch(() => this.show(strings.notices.recentFilesNotSaved));
  }

  private addTab(path: string): Tab {
    const handle = h("div", "tab");
    handle.setAttribute("role", "tab");
    const label = userText("button", "tab-label", basename(path));
    label.title = path;
    const close = this.actionButton("closeTab", "tab-close");
    handle.append(label, close);

    const canvas = h("div", "canvas");
    const sheet = h("article", "sheet");
    canvas.append(sheet);
    const tab: Tab = { path, handle, canvas, sheet };
    label.addEventListener("click", () => this.activate(tab));
    // The tab's own close button closes that tab, not the active one.
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      this.close(tab);
    });

    this.tabs.push(tab);
    this.tabStrip.append(handle);
    this.view.append(canvas);
    return tab;
  }

  private activate(tab: Tab): void {
    this.active = tab;
    this.update();
  }

  private close(tab: Tab): void {
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);
    tab.handle.remove();
    tab.canvas.remove();
    if (this.active === tab) this.active = this.tabs[Math.min(index, this.tabs.length - 1)] ?? null;
    this.update();
  }

  private enabled(id: ActionId): boolean {
    return id in this.handlers && (!actions[id].needsDocument || this.active !== null);
  }

  private run(id: ActionId): void {
    if (this.enabled(id)) this.handlers[id]?.();
  }

  private actionButton(id: ActionId, className: string): HTMLButtonElement {
    const action = actions[id];
    const button = h("button", className, action.icon ?? action.label);
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.dataset.action = id;
    // The tab's close button is wired per tab in addTab.
    if (id !== "closeTab") button.addEventListener("click", () => this.run(id));
    return button;
  }

  private buildBar(): HTMLElement {
    const header = h("header", "bar");
    for (const item of bar) {
      if (item.kind === "button") header.append(this.actionButton(item.action, "bar-button"));
      else if (item.kind === "title") header.append(this.title, this.notice);
      else if (item.kind === "menus") header.append(this.buildMenus());
      // ponytail: zoom is T13; until then the readout shows the unscaled sheet.
      else header.append(h("span", "zoom", strings.zoomPercent(100)));
    }
    return header;
  }

  private buildMenus(): HTMLElement {
    for (const menu of menus) {
      const wrap = h("div", "menu-wrap");
      const button = h("button", "menu-button", menu.label);
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      const list = h("div", "menu");
      list.setAttribute("role", "menu");
      list.hidden = true;
      for (const id of menu.items) {
        const item = h("button", "menu-item", actions[id].label);
        item.setAttribute("role", "menuitem");
        item.dataset.action = id;
        item.addEventListener("click", () => {
          this.closeMenus();
          this.run(id);
        });
        list.append(item);
      }
      button.addEventListener("click", () => {
        const opening = list.hidden;
        this.closeMenus();
        list.hidden = !opening;
        button.setAttribute("aria-expanded", String(opening));
      });
      wrap.append(button, list);
      this.menuBar.append(wrap);
    }
    return this.menuBar;
  }

  private closeMenus(): void {
    for (const list of this.menuBar.querySelectorAll<HTMLElement>(".menu")) list.hidden = true;
    for (const button of this.menuBar.querySelectorAll(".menu-button")) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") this.closeMenus();
    const action = Object.values(actions).find((a) => matchesKey(a.key, e));
    if (action && this.enabled(action.id)) {
      e.preventDefault();
      this.run(action.id);
    }
  }

  /** Links never navigate the webview: external ones go to the OS, `#` ones scroll. */
  private onLinkClick(e: MouseEvent): void {
    const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (!link || !this.active?.sheet.contains(link)) return;
    e.preventDefault();
    if (e.type !== "click" || e.button !== 0) return;
    const href = link.getAttribute("href") ?? "";
    if (link.hasAttribute("data-external")) void this.backend.openExternal(href).catch(() => {});
    else if (href.startsWith("#")) this.scrollTo(this.active.sheet, href.slice(1));
    // ponytail: relative `.md` links are T12's; until then a click does nothing.
  }

  private scrollTo(sheet: HTMLElement, fragment: string): void {
    let id = fragment;
    try {
      id = decodeURIComponent(fragment);
    } catch {}
    const target = [...sheet.querySelectorAll("[id], a[name]")].find(
      (n) => n.id === id || n.getAttribute("name") === id,
    );
    target?.scrollIntoView();
  }

  private update(): void {
    const { active } = this;
    this.tabStrip.hidden = this.tabs.length === 0;
    for (const tab of this.tabs) {
      tab.handle.classList.toggle("active", tab === active);
      tab.handle.setAttribute("aria-selected", String(tab === active));
      tab.canvas.hidden = tab !== active;
    }
    this.empty.hidden = active !== null;
    if (!active) this.drawEmpty();
    this.title.textContent = active ? basename(active.path) : "";
    this.root.ownerDocument.title = active
      ? strings.windowTitle(basename(active.path))
      : strings.appName;
    for (const node of this.root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
      if (node.classList.contains("tab-close")) continue;
      node.disabled = !this.enabled(node.dataset.action as ActionId);
    }
  }

  /** "Open or drop a Markdown file", and the recent files under it. */
  private drawEmpty(): void {
    const drop = h("button", "drop", strings.emptyState);
    drop.addEventListener("click", () => this.run("open"));
    this.empty.replaceChildren(drop);
    const recent = this.config?.recentFiles ?? [];
    if (recent.length === 0) return;
    const section = h("section", "recent");
    const list = h("ul");
    for (const path of recent) {
      const item = userText("button", "recent-file", basename(path));
      item.title = path;
      item.addEventListener("click", () => void this.openPaths([path]));
      const li = h("li");
      li.append(item);
      list.append(li);
    }
    section.append(h("h2", "", strings.recentFiles), list);
    this.empty.append(section);
  }
}
