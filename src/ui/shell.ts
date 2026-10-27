import { enhance } from "../render/enhance";
import { blockRemoteImages, imagePolicy } from "../render/enhance/images";
import { inlineSvgs } from "../render/enhance/svg";
import { render } from "../render/pipeline";
import { sanitize } from "../render/sanitize";
import { strings } from "../strings";
import { type ActionId, actions, bar, matchesKey, menus } from "./definition";
import { type Backend, type Config, type Doc, type DocumentChanged, errorMessage } from "./ipc";
import { type Entry, findTarget, type Gesture, History, route } from "./links";
import { restoreScroll, scrollAnchor, watchFile } from "./watch";

const MAX_RECENT_FILES = 10;
const NOTICE_MS = 6000;

interface Tab {
  history: History;
  /** The tab's entry in the tab strip, and the file name on it. */
  handle: HTMLElement;
  label: HTMLElement;
  /** The grey canvas that scrolls; each tab keeps its own, so switching keeps the scroll. */
  canvas: HTMLElement;
  sheet: HTMLElement;
  /** Counts loads and reloads, so only the latest request fills the sheet. */
  loads: number;
  /** The load in flight, or the last one. */
  loading: Promise<void>;
  /** The path the tab watches, and how to stop; follows the file the tab shows. */
  watched?: { path: string; stop: () => void };
}

const pathOf = (tab: Tab) => tab.history.current.path;

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
  private unlisten: (() => void)[] = [];

  // Actions without a handler are drawn disabled until their task lands (T12, T13).
  private readonly handlers: Partial<Record<ActionId, () => void>> = {
    open: () => void this.openDialog(),
    print: () => window.print(),
    closeTab: () => this.active && this.close(this.active),
    back: () => this.active && this.go(this.active, "back"),
    forward: () => this.active && this.go(this.active, "forward"),
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
    const unlisten = await Promise.all([
      this.backend.onOpenFiles((paths) => {
        if (!this.disposed) void this.openPaths(paths);
      }),
      this.backend.onDocumentChanged((change) => {
        if (!this.disposed) this.onDocumentChanged(change);
      }),
    ]);
    if (this.disposed) for (const stop of unlisten) stop();
    else this.unlisten = unlisten;
    this.config = await this.backend.getConfig().catch(() => {
      this.show(strings.notices.settingsUnavailable);
      return null;
    });
    // Before any document is inserted; config unread means the default, remote images on.
    if (this.config?.remoteImages === false) blockRemoteImages(this.root.ownerDocument);
    this.update();
    await this.openPaths(await this.backend.takeOpenFiles());
  }

  /** Removes the window's listeners; the shell does nothing afterwards. */
  dispose(): void {
    this.disposed = true;
    this.listeners.abort();
    for (const stop of this.unlisten) stop();
    for (const tab of this.tabs) this.watch(tab, null);
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
    await this.openEntries(paths.map((path) => ({ path, fragment: "", scroll: 0 })));
  }

  private async openEntries(entries: Entry[]): Promise<void> {
    const added: Tab[] = [];
    let last: Tab | undefined;
    // A `#fragment` for a tab that is already open; a new tab lands on its own.
    let jump = "";
    for (const entry of entries) {
      last = this.tabs.find((t) => pathOf(t) === entry.path);
      jump = last ? entry.fragment : "";
      if (!last) {
        last = this.addTab(entry);
        added.push(last);
      }
    }
    if (!last) return;
    const tab = last;
    this.activate(tab);
    await Promise.all(added.map((t) => this.load(t)));
    if (!jump) return;
    // Lands once that tab's own load is done, so a half-loaded sheet is not searched.
    let pending: Promise<void>;
    do {
      pending = tab.loading;
      await pending;
    } while (pending !== tab.loading);
    if (!this.disposed && this.active === tab) this.land(tab, jump);
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

  /** `read_document` → render → sanitise → insert → enhance. Errors stay in the sheet, never a
   * dialog. A reload keeps the reader's place and, if it fails, the last version. */
  private load(tab: Tab, reload = false): Promise<void> {
    tab.loading = this.fill(tab, reload);
    return tab.loading;
  }

  private async fill(tab: Tab, reload: boolean): Promise<void> {
    const entry = tab.history.current;
    // Orders overlapping reads by request, not by mtime: a coarse or older mtime still reloads.
    const seq = ++tab.loads;
    // A tab closed, moved on or reloaded again while its read was in flight takes no result.
    const live = () => !this.disposed && this.tabs.includes(tab) && tab.loads === seq;
    try {
      const doc = await this.read(entry);
      if (!live()) return;
      const anchor = reload ? scrollAnchor(tab.canvas, tab.sheet) : undefined;
      const remoteImages = this.config?.remoteImages ?? true;
      const { readSvg, assetUrl } = this.backend;
      tab.sheet.innerHTML = sanitize(
        render(doc.text),
        imagePolicy(doc.path, remoteImages, (path) => assetUrl(path)),
      );
      // ponytail: the outline it returns is unused until T13's outline panel.
      enhance(tab.sheet);
      // Before the scroll is restored, since inlined SVGs take their own height.
      await inlineSvgs(
        tab.sheet,
        (path) => readSvg(path),
        (path) => assetUrl(path),
      );
      if (!live()) return;
      // ponytail: watching starts after a successful read, so a missing file adds no second
      // notice; a save in the moment between the two is not seen.
      this.watch(tab, entry.path);
      if (anchor) {
        restoreScroll(tab.canvas, tab.sheet, anchor);
      } else {
        this.remember(doc.path);
        // Back and forward return to where the user was; the fragment is for the first visit.
        if (entry.fragment && !entry.visited) this.land(tab, entry.fragment);
        else tab.canvas.scrollTop = entry.scroll;
        entry.visited = true;
      }
    } catch (err) {
      if (!live()) return;
      if (reload) return this.fileNotice(tab, strings.fileNotices.reloadFailed);
      this.watch(tab, null);
      const box = h("div", "doc-error");
      box.append(h("p", "", strings.documentError), userText("p", "", errorMessage(err)));
      tab.sheet.replaceChildren(box);
    }
    this.update();
  }

  /** Reads the entry's file, or the first of its alternates that exists. */
  private async read(entry: Entry): Promise<Doc> {
    let first: unknown;
    for (const path of [entry.path, ...(entry.alternates ?? [])]) {
      try {
        const doc = await this.backend.readDocument(path);
        entry.path = path;
        entry.alternates = undefined;
        return doc;
      } catch (err) {
        first ??= err;
        if ((err as { kind?: string } | null)?.kind !== "not_found") break;
      }
    }
    throw first;
  }

  /** Follows a link in place: a new history entry in the same tab. */
  private navigate(tab: Tab, entry: Entry): void {
    tab.history.current.scroll = tab.canvas.scrollTop;
    tab.history.push(entry);
    this.update();
    void this.load(tab);
  }

  private go(tab: Tab, direction: "back" | "forward"): void {
    const leaving = tab.history.current;
    const scroll = tab.canvas.scrollTop;
    if (!tab.history[direction]()) return;
    leaving.scroll = scroll;
    this.update();
    void this.load(tab);
  }

  /** Scrolls to `#fragment`, or to the top for `#`; a missing one is a notice, not a dialog. */
  private land(tab: Tab, fragment: string): void {
    if (!fragment) {
      tab.canvas.scrollTop = 0;
      return;
    }
    const target = findTarget(tab.sheet, fragment);
    if (target) target.scrollIntoView();
    else this.show(strings.notices.sectionNotFound);
  }

  /** `document-changed`: every tab on the path reloads, or keeps its sheet if it was deleted. */
  private onDocumentChanged(change: DocumentChanged): void {
    for (const tab of this.tabs) {
      // A tab still loading another file after navigating takes the change on its own load.
      if (tab.watched?.path !== change.path || pathOf(tab) !== change.path) continue;
      if (change.deleted) this.fileNotice(tab, strings.fileNotices.deleted);
      else void this.load(tab, true);
    }
  }

  /** A one-line notice at the top of the sheet, over the last version; the next render clears it. */
  private fileNotice(tab: Tab, message: string): void {
    tab.sheet.querySelector(":scope > .file-notice")?.remove();
    const notice = h("p", "file-notice", message);
    notice.setAttribute("role", "status");
    tab.sheet.prepend(notice);
  }

  /** Moves the tab's watch to `path`, or ends it; the core counts watchers per path. */
  private watch(tab: Tab, path: string | null): void {
    if (tab.watched?.path === path) return;
    tab.watched?.stop();
    tab.watched = path
      ? { path, stop: watchFile(this.backend, path, () => this.show(strings.notices.watchFailed)) }
      : undefined;
  }

  private remember(path: string): void {
    if (!this.config) return;
    const recent = [path, ...this.config.recentFiles.filter((p) => p !== path)];
    this.config = { ...this.config, recentFiles: recent.slice(0, MAX_RECENT_FILES) };
    void this.backend
      .setConfig(this.config)
      .catch(() => this.show(strings.notices.recentFilesNotSaved));
  }

  private addTab(entry: Entry): Tab {
    const handle = h("div", "tab");
    handle.setAttribute("role", "tab");
    // Named in update(), since following a link changes the tab's file.
    const label = userText("button", "tab-label", "");
    const close = this.actionButton("closeTab", "tab-close");
    handle.append(label, close);

    const canvas = h("div", "canvas");
    const sheet = h("article", "sheet");
    canvas.append(sheet);
    const tab: Tab = {
      history: new History(entry),
      handle,
      label,
      canvas,
      sheet,
      loads: 0,
      loading: Promise.resolve(),
    };
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
    this.watch(tab, null);
    tab.handle.remove();
    tab.canvas.remove();
    if (this.active === tab) this.active = this.tabs[Math.min(index, this.tabs.length - 1)] ?? null;
    this.update();
  }

  private enabled(id: ActionId): boolean {
    if (!(id in this.handlers) || (actions[id].needsDocument && !this.active)) return false;
    if (id === "back") return this.active?.history.canGoBack === true;
    if (id === "forward") return this.active?.history.canGoForward === true;
    return true;
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

  /**
   * Links never navigate the webview: external ones go to the OS, `#` ones scroll, Markdown
   * ones open in the tab, or in a new tab on Ctrl-click or middle-click.
   */
  private onLinkClick(e: MouseEvent): void {
    const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
    const tab = this.active;
    if (!link || !tab?.sheet.contains(link)) return;
    e.preventDefault();
    let gesture: Gesture;
    if (e.type === "auxclick" && e.button === 1) gesture = "newTab";
    else if (e.type === "click" && e.button === 0) {
      gesture = e.ctrlKey || e.metaKey ? "newTab" : "click";
    } else return;
    const action = route(link, pathOf(tab), gesture);
    if (action.type === "external") void this.backend.openExternal(action.url).catch(() => {});
    else if (action.type === "scroll") this.land(tab, action.fragment);
    else if (action.type === "navigate") this.navigate(tab, action.entry);
    else if (action.type === "newTab") void this.openEntries([action.entry]);
    else this.show(strings.notices.notMarkdown);
  }

  private update(): void {
    const { active } = this;
    this.tabStrip.hidden = this.tabs.length === 0;
    for (const tab of this.tabs) {
      tab.label.textContent = basename(pathOf(tab));
      tab.label.title = pathOf(tab);
      tab.handle.classList.toggle("active", tab === active);
      tab.handle.setAttribute("aria-selected", String(tab === active));
      tab.canvas.hidden = tab !== active;
    }
    this.empty.hidden = active !== null;
    if (!active) this.drawEmpty();
    this.title.textContent = active ? basename(pathOf(active)) : "";
    this.root.ownerDocument.title = active
      ? strings.windowTitle(basename(pathOf(active)))
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
