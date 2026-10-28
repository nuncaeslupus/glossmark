import { renderDocument } from "../render/document";
import { blockRemoteImages, imagePolicy } from "../render/enhance/images";
import { diagramsForPaper } from "../render/enhance/mermaid";
import { inlineSvgs } from "../render/enhance/svg";
import { strings } from "../strings";
import { applyUserCss } from "../themes/user-css";
import { type ActionId, actions, bar, matchesKey, menus } from "./definition";
import { clearMatches, highlightMatches } from "./find";
import { type Backend, type Config, type Doc, type DocumentChanged, errorMessage } from "./ipc";
import { type Entry, findTarget, type Gesture, History, route } from "./links";
import { currentSection, type Section, sections } from "./outline";
import { restoreScroll, scrollAnchor, watchFile } from "./watch";
import { clampZoom, fitWidth, stepZoom } from "./zoom";

const MAX_RECENT_FILES = 10;
const NOTICE_MS = 6000;
const THEMES = ["system", "light", "dark"] as const;
const FIND_DEBOUNCE_MS = 100;
/** Find stops marking here, so a common word in a large document stays quick. */
const FIND_LIMIT = 1000;
/** Zoom keys come in bursts; the level is saved once the reader settles on it. */
const ZOOM_SAVE_MS = 500;

interface Tab {
  history: History;
  /** The tab's entry in the tab strip, and the file name on it. */
  handle: HTMLElement;
  label: HTMLElement;
  /** The grey canvas that scrolls; each tab keeps its own, so switching keeps the scroll. */
  canvas: HTMLElement;
  sheet: HTMLElement;
  /** The outline of what the sheet shows. */
  sections: Section[];
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

/** A button showing `icon`: a glyph, or SVG path data on Material Symbols' 960 grid. */
function iconButton(className: string, icon: string): HTMLButtonElement {
  if (!icon.startsWith("M")) return h("button", className, icon);
  const button = h("button", className);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 -960 960 960");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", icon);
  svg.append(path);
  button.append(svg);
  return button;
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
  private readonly menuBar = h("div", "menu-wrap");
  private readonly notice = h("span", "notice");
  private readonly zoomReadout = h("span", "zoom");
  private readonly outlinePanel = h("nav", "outline");
  private outlineOpen = false;
  /** The sections the outline panel lists, so it is redrawn only when they change. */
  private drawnSections: Section[] | null = null;
  private readonly findBox = h("div", "find");
  private readonly findInput = h("input", "find-input");
  private readonly findCount = h("span", "find-count");
  /** Find in page: the sheet holding the marks, the marks, and the current one. */
  private found = { open: false, root: null as HTMLElement | null, marks: [] as HTMLElement[] };
  private foundIndex = -1;
  private foundMore = false;
  private findTimer: ReturnType<typeof setTimeout> | undefined;
  /** After a click in the outline, the clicked entry stays current until the reader scrolls. */
  private sectionHeld = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private remoteItem: HTMLElement | null = null;
  private shortcutsPanel: HTMLElement | null = null;
  private themeItem: HTMLElement | null = null;
  private theme: Config["theme"] = "system";
  private zoom = 100;
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private dialogOpen = false;
  private disposed = false;
  private readonly listeners = new AbortController();
  private unlisten: (() => void)[] = [];

  private readonly handlers: Record<ActionId, () => void> = {
    open: () => void this.openDialog(),
    // `print()` usually blocks until the dialog closes; restoring after it covers a webview
    // that never fires `afterprint`.
    print: () =>
      void diagramsForPaper().then((back) => {
        window.print();
        back();
      }),
    export: () => void this.exportPdf(),
    closeTab: () => this.active && this.close(this.active),
    nextTab: () => this.cycleTab(1),
    previousTab: () => this.cycleTab(-1),
    outline: () => {
      this.outlineOpen = !this.outlineOpen;
      this.update();
    },
    back: () => this.active && this.go(this.active, "back"),
    forward: () => this.active && this.go(this.active, "forward"),
    zoomOut: () => this.setZoom(stepZoom(this.zoom, -1)),
    zoomIn: () => this.setZoom(stepZoom(this.zoom, 1)),
    zoomReset: () => this.setZoom(100),
    fitWidth: () => this.active && this.setZoom(fitWidth(this.active.canvas.clientWidth)),
    find: () => this.openFind(),
    findNext: () => this.stepFind(1),
    findPrevious: () => this.stepFind(-1),
    findClose: () => this.closeFind(),
    theme: () => {
      this.theme = THEMES[(THEMES.indexOf(this.theme) + 1) % THEMES.length];
      this.saveSettings();
    },
    remoteImages: () => {
      void this.setRemoteImages(!(this.config?.remoteImages ?? true)).then(() => this.update());
    },
    shortcuts: () => this.toggleShortcuts(),
  };

  constructor(
    private readonly root: HTMLElement,
    private readonly backend: Backend,
    private readonly reloadWindow: () => void = () => location.reload(),
  ) {
    this.tabStrip.setAttribute("role", "tablist");
    this.outlinePanel.setAttribute("aria-label", strings.actions.outline);
    this.view.append(this.empty, this.outlinePanel);
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
      this.backend.onUpdateAvailable(({ version }) => {
        if (!this.disposed) this.offerUpdate(version);
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
    if (this.config) {
      this.theme = THEMES.includes(this.config.theme) ? this.config.theme : "system";
      this.zoom = clampZoom(this.config.defaultZoom);
    }
    await this.backend.readUserCss().then(
      (css) => applyUserCss(this.root.ownerDocument, css),
      () => this.show(strings.notices.userCssUnavailable),
    );
    this.update();
    await this.openPaths(await this.backend.takeOpenFiles());
    // After first paint, so the request cannot delay it; offline is no notice (D-31).
    this.backend.checkUpdate().catch(() => {});
  }

  /** Removes the window's listeners; the shell does nothing afterwards. */
  dispose(): void {
    this.disposed = true;
    this.listeners.abort();
    for (const stop of this.unlisten) stop();
    for (const tab of this.tabs) this.watch(tab, null);
    clearTimeout(this.noticeTimer);
    clearTimeout(this.findTimer);
    if (this.saveTimer !== undefined) this.writeSettings();
  }

  /** A one-line message in the bar that fades on its own: never a dialog (D-11). */
  private show(message: string): void {
    this.notice.textContent = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice.replaceChildren();
    }, NOTICE_MS);
  }

  /**
   * The remote-images setting (D-12), saved first. Off applies at once: the CSP is narrowed and
   * open tabs re-render without remote images. On reloads the window, since a narrowed CSP cannot
   * be lifted.
   */
  async setRemoteImages(on: boolean): Promise<void> {
    if (!this.config || this.config.remoteImages === on) return;
    const next = { ...this.config, remoteImages: on };
    try {
      await this.backend.setConfig(next);
    } catch {
      this.show(strings.notices.settingNotSaved);
      return;
    }
    this.config = next;
    if (on) return this.reloadWindow();
    blockRemoteImages(this.root.ownerDocument);
    await Promise.all(this.tabs.map((tab) => this.load(tab, true)));
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

  /** Export: the print styling, saved as a PDF where the user picks (D-20). */
  private async exportPdf(): Promise<void> {
    if (this.dialogOpen || !this.active) return;
    this.dialogOpen = true;
    try {
      const name = basename(pathOf(this.active)).replace(/\.[^.]*$/, "");
      const path = await this.backend.saveDialog(`${name}.pdf`);
      if (!path) return;
      const back = await diagramsForPaper();
      try {
        await this.backend.exportPdf(path);
      } finally {
        back();
      }
    } catch {
      this.show(strings.notices.exportFailed);
    } finally {
      this.dialogOpen = false;
    }
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
      const { readSvg, imageUrl } = this.backend;
      const { outline, settled } = await renderDocument(tab.sheet, doc.text, {
        current: live,
        images: imagePolicy(doc.path, remoteImages, (path) => imageUrl(path)),
      });
      if (!live()) return;
      // Back and forward return to where the user was; the fragment is for the first visit.
      const fragment = !anchor && !entry.visited ? entry.fragment : "";
      const place = anchor ?? (fragment ? undefined : entry.anchor);
      // A plain offset (the top, mostly) is taken at once, so a reader scrolling while the
      // rest settles is not sent back.
      if (!place && !fragment) tab.canvas.scrollTop = entry.scroll;
      if (!anchor) {
        this.remember(doc.path);
        entry.visited = true;
      }
      // A large document shows at once but is laid out by estimate off screen until it
      // settles (after its diagrams); a heading or fragment is found on the real layout.
      await settled;
      if (!live()) return;
      // Before the scroll is restored, since inlined SVGs take their own height.
      await inlineSvgs(
        tab.sheet,
        (path) => readSvg(path),
        (path) => imageUrl(path),
      );
      if (!live()) return;
      tab.sections = sections(tab.sheet, outline);
      if (this.found.root === tab.sheet) this.runFind(false);
      // ponytail: watching starts after a successful read, so a missing file adds no second
      // notice; a save in the moment between the two is not seen.
      this.watch(tab, entry.path);
      if (place) restoreScroll(tab.canvas, tab.sheet, place);
      else if (fragment) this.land(tab, fragment);
    } catch (err) {
      if (!live()) return;
      if (reload) return this.fileNotice(tab, strings.fileNotices.reloadFailed);
      this.watch(tab, null);
      tab.sections = [];
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

  /** Records where the reader is in `entry`: the offset, and the heading at the top, which
   * survives a large document's boxes being laid out after it comes back. */
  private leave(tab: Tab, entry: Entry): void {
    entry.scroll = tab.canvas.scrollTop;
    entry.anchor = scrollAnchor(tab.canvas, tab.sheet);
  }

  /** Follows a link in place: a new history entry in the same tab. */
  private navigate(tab: Tab, entry: Entry): void {
    this.leave(tab, tab.history.current);
    tab.history.push(entry);
    this.update();
    void this.load(tab);
  }

  private go(tab: Tab, direction: "back" | "forward"): void {
    this.leave(tab, tab.history.current);
    if (!tab.history[direction]()) return;
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

  /** Theme and zoom: applied at once, kept in the config (when it could be read) after `delay`.
   * The zoom last used is the default zoom: with no settings dialog (D-11), it is how one is set. */
  private saveSettings(delay = 0): void {
    this.update();
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.writeSettings(), delay);
  }

  private writeSettings(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    if (!this.config) return;
    this.config = { ...this.config, theme: this.theme, defaultZoom: this.zoom };
    void this.backend
      .setConfig(this.config)
      .catch(() => this.show(strings.notices.settingNotSaved));
  }

  /** Zooms the sheets; the active tab keeps the heading the reader is at. */
  private setZoom(percent: number): void {
    const tab = this.active;
    const anchor = tab && scrollAnchor(tab.canvas, tab.sheet);
    this.zoom = clampZoom(percent);
    this.saveSettings(ZOOM_SAVE_MS);
    if (tab && anchor) restoreScroll(tab.canvas, tab.sheet, anchor);
  }

  /** Shows the active tab's outline, redrawn only when its sections changed. */
  private drawOutline(): void {
    const tab = this.active;
    const open = this.outlineOpen && tab !== null;
    this.outlinePanel.hidden = !open;
    this.view.classList.toggle("with-outline", open);
    if (!open) return;
    if (this.drawnSections !== tab.sections) this.listSections(tab.sections);
    if (!this.sectionHeld) this.markSection(currentSection(tab.canvas, tab.sections));
  }

  private listSections(list: Section[]): void {
    this.drawnSections = list;
    this.sectionHeld = false;
    if (list.length === 0) {
      this.outlinePanel.replaceChildren(h("p", "outline-empty", strings.outlineEmpty));
      return;
    }
    const top = Math.min(...list.map((s) => s.heading.level));
    const ul = h("ul");
    for (const [i, { heading, node }] of list.entries()) {
      const item = userText("button", "outline-item", heading.text);
      item.title = heading.text;
      item.style.setProperty("--depth", String(heading.level - top));
      item.addEventListener("click", () => {
        this.sectionHeld = true;
        node.scrollIntoView?.();
        this.markSection(i);
      });
      const li = h("li");
      li.append(item);
      ul.append(li);
    }
    this.outlinePanel.replaceChildren(ul);
  }

  private markSection(index: number): void {
    for (const [i, item] of this.outlinePanel.querySelectorAll(".outline-item").entries()) {
      item.classList.toggle("current", i === index);
      if (i === index) item.setAttribute("aria-current", "location");
      else item.removeAttribute("aria-current");
    }
  }

  private openFind(): void {
    clearTimeout(this.findTimer);
    this.found.open = true;
    this.findBox.hidden = false;
    this.findInput.focus();
    this.findInput.select();
    this.runFind(true);
    this.update();
  }

  private closeFind(): void {
    clearTimeout(this.findTimer);
    this.found.open = false;
    this.findBox.hidden = true;
    this.runFind(false);
    this.update();
  }

  /** Marks the query's matches in the active sheet. `jump` goes to the first match from the
   * reader's place; otherwise (a reload) the current match keeps its number. */
  private runFind(jump: boolean): void {
    const tab = this.active;
    const keep = this.foundIndex;
    if (this.found.root) clearMatches(this.found.root);
    this.found.marks = [];
    this.found.root = this.found.open && tab ? tab.sheet : null;
    this.foundIndex = -1;
    const { marks, more } = this.found.root
      ? highlightMatches(this.found.root, this.findInput.value, FIND_LIMIT)
      : { marks: [], more: false };
    this.found.marks = marks;
    this.foundMore = more;
    let index = -1;
    if (marks.length > 0 && !jump) index = Math.min(Math.max(keep, 0), marks.length - 1);
    else if (marks.length > 0 && tab) {
      const top = tab.canvas.getBoundingClientRect().top;
      index = Math.max(
        marks.findIndex((m) => m.getBoundingClientRect().top >= top),
        0,
      );
    }
    this.selectMatch(index, jump);
  }

  private stepFind(direction: 1 | -1): void {
    const count = this.found.marks.length;
    if (count > 0) this.selectMatch((this.foundIndex + direction + count) % count, true);
  }

  private selectMatch(index: number, scroll: boolean): void {
    this.found.marks[this.foundIndex]?.classList.remove("current");
    this.foundIndex = index;
    const mark = this.found.marks[index];
    if (mark) {
      mark.classList.add("current");
      if (scroll) {
        for (let d = mark.closest("details"); d; d = d.parentElement?.closest("details") ?? null) {
          d.open = true;
        }
        mark.scrollIntoView?.({ block: "center" });
      }
    }
    const count = this.found.marks.length;
    if (count > 0) {
      const counted = this.foundMore ? strings.findCountMore : strings.findCount;
      this.findCount.textContent = counted(index + 1, count);
    } else if (this.found.open && this.findInput.value)
      this.findCount.textContent = strings.findNone;
    else this.findCount.replaceChildren();
  }

  /** Help › Keyboard shortcuts: a list beside the page, not a dialog; F1 or Esc closes it. */
  private toggleShortcuts(): void {
    if (this.shortcutsPanel) {
      this.shortcutsPanel.remove();
      this.shortcutsPanel = null;
      return;
    }
    const panel = h("section", "shortcuts");
    panel.setAttribute("aria-label", strings.actions.shortcuts);
    const table = h("table");
    for (const action of Object.values(actions)) {
      const row = h("tr");
      row.dataset.action = action.id;
      const key = h("td");
      key.append(h("kbd", "", action.key));
      row.append(h("td", "", action.label), key);
      table.append(row);
    }
    panel.append(
      h("h2", "", strings.actions.shortcuts),
      table,
      h("p", "shortcuts-hint", strings.shortcutsHint),
    );
    this.view.append(panel);
    this.shortcutsPanel = panel;
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
      sections: [],
      loads: 0,
      loading: Promise.resolve(),
    };
    label.addEventListener("click", () => this.activate(tab));
    canvas.addEventListener(
      "scroll",
      () => {
        if (tab === this.active && this.outlineOpen && !this.sectionHeld) {
          this.markSection(currentSection(canvas, tab.sections));
        }
      },
      { passive: true, signal: this.listeners.signal },
    );
    // The reader scrolling, not a jump from the outline, releases the clicked entry.
    for (const type of ["wheel", "touchstart", "mousedown"]) {
      canvas.addEventListener(
        type,
        () => {
          this.sectionHeld = false;
        },
        { passive: true, signal: this.listeners.signal },
      );
    }
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

  /** Ctrl+Tab and Ctrl+Shift+Tab, wrapping at the ends. */
  private cycleTab(step: number): void {
    if (!this.active) return;
    const n = this.tabs.length;
    const tab = this.tabs[(this.tabs.indexOf(this.active) + step + n) % n];
    if (tab) this.activate(tab);
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
    if (actions[id].needsDocument && !this.active) return false;
    if (id === "back") return this.active?.history.canGoBack === true;
    if (id === "forward") return this.active?.history.canGoForward === true;
    if (id === "findNext" || id === "findPrevious") return this.found.marks.length > 0;
    if (id === "findClose") return this.found.open;
    if (id === "remoteImages") return this.config !== null;
    return true;
  }

  private run(id: ActionId): void {
    if (this.enabled(id)) this.handlers[id]();
  }

  private actionButton(id: ActionId, className: string): HTMLButtonElement {
    const action = actions[id];
    const button = iconButton(className, action.icon ?? action.label);
    button.title = action.label;
    button.setAttribute("aria-label", action.label);
    button.dataset.action = id;
    // The tab's close button is wired per tab in addTab.
    if (id !== "closeTab") button.addEventListener("click", () => this.run(id));
    return button;
  }

  private buildBar(): HTMLElement {
    const header = h("header", "bar");
    for (const items of bar) {
      const zone = h("div", "zone");
      for (const item of items) {
        if (item.kind === "button") zone.append(this.actionButton(item.action, "bar-button"));
        else if (item.kind === "title") zone.append(this.title, this.notice);
        else if (item.kind === "more") zone.append(this.buildMore());
        else zone.append(this.zoomReadout);
      }
      header.append(zone);
    }
    header.append(this.buildFind());
    return header;
  }

  /** The find box under the bar, shown by Find: Enter and Shift+Enter cycle the matches. */
  private buildFind(): HTMLElement {
    this.findBox.hidden = true;
    this.findBox.setAttribute("role", "search");
    this.findInput.type = "text";
    this.findInput.placeholder = strings.findPlaceholder;
    this.findInput.setAttribute("aria-label", strings.findPlaceholder);
    const search = () => {
      clearTimeout(this.findTimer);
      this.findTimer = undefined;
      this.runFind(true);
      this.update();
    };
    this.findInput.addEventListener("input", () => {
      clearTimeout(this.findTimer);
      this.findTimer = setTimeout(search, FIND_DEBOUNCE_MS);
    });
    this.findInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      // Typed and Enter at once: the search runs first, then Enter moves on, as it would have.
      if (this.findTimer !== undefined) search();
      this.stepFind(e.shiftKey ? -1 : 1);
    });
    this.findCount.setAttribute("aria-live", "polite");
    this.findBox.append(
      this.findInput,
      this.findCount,
      this.actionButton("findPrevious", "find-button"),
      this.actionButton("findNext", "find-button"),
      this.actionButton("findClose", "find-button"),
    );
    return this.findBox;
  }

  /** ⋮ More: the menu's sections in one list, divided by rules. */
  private buildMore(): HTMLElement {
    const button = iconButton("menu-button", strings.icons.more);
    button.title = strings.more;
    button.setAttribute("aria-label", strings.more);
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    const list = h("div", "menu");
    list.setAttribute("role", "menu");
    list.hidden = true;
    for (const [n, section] of menus.entries()) {
      if (n > 0) {
        const rule = h("div", "menu-rule");
        rule.setAttribute("role", "separator");
        list.append(rule);
      }
      for (const id of section) {
        const item = h("button", "menu-item", actions[id].label);
        item.setAttribute("role", "menuitem");
        item.dataset.action = id;
        if (id === "theme") this.themeItem = item;
        if (id === "remoteImages") {
          this.remoteItem = item;
          item.setAttribute("role", "menuitemcheckbox");
        }
        item.addEventListener("click", () => {
          this.closeMenus();
          this.run(id);
        });
        list.append(item);
      }
    }
    button.addEventListener("click", () => {
      const opening = list.hidden;
      this.closeMenus();
      list.hidden = !opening;
      button.setAttribute("aria-expanded", String(opening));
    });
    this.menuBar.append(button, list);
    return this.menuBar;
  }

  /** More › Restart to update to x.y.z, in its own section at the end; a later version replaces it. */
  private offerUpdate(version: string): void {
    const list = this.menuBar.querySelector(".menu");
    const offered = list?.querySelector('[data-action="update"]');
    if (offered) offered.textContent = strings.restartToUpdate(version);
    if (!list || offered) return;
    const rule = h("div", "menu-rule");
    rule.setAttribute("role", "separator");
    const item = h("button", "menu-item", strings.restartToUpdate(version));
    item.setAttribute("role", "menuitem");
    item.dataset.action = "update";
    item.addEventListener("click", () => {
      this.closeMenus();
      this.backend.installUpdate().catch(() => this.show(strings.notices.updateFailed));
    });
    list.append(rule, item);
  }

  private closeMenus(): void {
    for (const list of this.menuBar.querySelectorAll<HTMLElement>(".menu")) list.hidden = true;
    for (const button of this.menuBar.querySelectorAll(".menu-button")) {
      button.setAttribute("aria-expanded", "false");
    }
  }

  private onKey(e: KeyboardEvent): void {
    // A key may scroll the page, which releases a section clicked in the outline.
    this.sectionHeld = false;
    // Esc closes an open menu or the shortcuts list before it closes find.
    const menuOpen = [...this.menuBar.querySelectorAll<HTMLElement>(".menu")].some(
      (m) => !m.hidden,
    );
    if (e.key === "Escape" && (menuOpen || this.shortcutsPanel)) {
      this.closeMenus();
      if (this.shortcutsPanel) this.toggleShortcuts();
      e.preventDefault();
      return;
    }
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
    // Find follows the active tab, and closes with the last one.
    if (!active) {
      this.found.open = false;
      this.findBox.hidden = true;
    }
    if (this.found.root !== (this.found.open ? active?.sheet : null)) this.runFind(true);
    for (const node of this.root.querySelectorAll<HTMLButtonElement>("button[data-action]")) {
      if (node.classList.contains("tab-close")) continue;
      node.disabled = !this.enabled(node.dataset.action as ActionId);
    }
    for (const node of this.root.querySelectorAll(".bar-button[data-action=outline]")) {
      node.setAttribute("aria-pressed", String(this.outlineOpen));
    }
    this.applySettings();
    this.drawOutline();
  }

  private applySettings(): void {
    const html = this.root.ownerDocument.documentElement;
    if (this.theme === "system") delete html.dataset.theme;
    else html.dataset.theme = this.theme;
    this.view.style.setProperty("--zoom", String(this.zoom / 100));
    this.zoomReadout.textContent = strings.zoomPercent(this.zoom);
    if (this.themeItem) this.themeItem.textContent = strings.themes[this.theme];
    this.remoteItem?.setAttribute("aria-checked", String(this.config?.remoteImages ?? true));
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
