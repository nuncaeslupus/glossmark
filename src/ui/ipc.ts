import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface Config {
  version: number;
  theme: "system" | "light" | "dark";
  defaultZoom: number;
  remoteImages: boolean;
  recentFiles: string[];
}

export interface Doc {
  path: string;
  text: string;
  mtime_ms: number;
}

/** Payload of `document-changed`: a new `mtime_ms`, or `deleted`. */
export interface DocumentChanged {
  path: string;
  mtime_ms?: number;
  deleted?: boolean;
}

/** Payload of `update-available`: the newer version the updater found. */
export interface UpdateAvailable {
  version: string;
}

/** The Rust core, as the shell sees it; tests pass a fake. */
export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}

export interface Backend {
  takeOpenFiles(): Promise<string[]>;
  openDialog(): Promise<string[]>;
  /** The native Save dialog, offering `name`; `null` when cancelled. */
  saveDialog(name: string): Promise<string | null>;
  /** Prints the page to `path`, which must be the Save dialog's last answer. */
  exportPdf(path: string): Promise<void>;
  readDocument(path: string): Promise<Doc>;
  /** The markup of a local SVG, for inlining after sanitising (2 MB cap). */
  readSvg(path: string): Promise<string>;
  /** The `image:` protocol URL of a local image, for `<img src>`. */
  imageUrl(path: string): string;
  getConfig(): Promise<Config>;
  setConfig(config: Config): Promise<void>;
  /** `$XDG_CONFIG_HOME/glossmark/user.css`, or `null` when there is none. */
  readUserCss(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  /** Opens the system file manager at an open document, with it selected. */
  revealFile(path: string): Promise<void>;
  /** The window's own buttons, drawn in the tab strip; absent where the system draws them. */
  window?: WindowControls;
  /** Watching is reference-counted in the core: each `watch` needs its own `unwatch`. */
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  /** Asks for `latest.json` once; a newer version arrives as `update-available`. */
  checkUpdate(): Promise<void>;
  /** Installs the newer version and restarts into it; settles only on failure. */
  installUpdate(): Promise<void>;
  /** Resolves to the function that stops listening. */
  onOpenFiles(handler: (paths: string[]) => void): Promise<() => void>;
  onDocumentChanged(handler: (change: DocumentChanged) => void): Promise<() => void>;
  onUpdateAvailable(handler: (update: UpdateAvailable) => void): Promise<() => void>;
}

interface OpenFiles {
  paths: string[];
}

export const tauriBackend: Backend = {
  takeOpenFiles: () => invoke<OpenFiles>("take_open_files").then((r) => r.paths),
  openDialog: () => invoke<OpenFiles>("open_dialog").then((r) => r.paths),
  saveDialog: (name) => invoke<string | null>("save_dialog", { name }),
  exportPdf: (path) => invoke<void>("export_pdf", { path }),
  readDocument: (path) => invoke<Doc>("read_document", { path }),
  readSvg: (path) => invoke<{ svg: string }>("read_svg", { path }).then((r) => r.svg),
  imageUrl: (path) => convertFileSrc(path, "image"),
  getConfig: () => invoke<Config>("get_config"),
  setConfig: (config) => invoke<void>("set_config", { config }),
  readUserCss: () => invoke<{ css: string | null }>("read_user_css").then((r) => r.css),
  openExternal: (url) => invoke<void>("open_external", { url }),
  revealFile: (path) => invoke<void>("reveal_file", { path }),
  window: {
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
    close: () => getCurrentWindow().close(),
  },
  watch: (path) => invoke<void>("watch", { path }),
  unwatch: (path) => invoke<void>("unwatch", { path }),
  checkUpdate: () => invoke<void>("check_update"),
  installUpdate: () => invoke<void>("install_update"),
  onOpenFiles: (handler) => listen<OpenFiles>("open-files", (e) => handler(e.payload.paths)),
  onDocumentChanged: (handler) =>
    listen<DocumentChanged>("document-changed", (e) => handler(e.payload)),
  onUpdateAvailable: (handler) =>
    listen<UpdateAvailable>("update-available", (e) => handler(e.payload)),
};

/** The message of an `IpcError` (`{kind, message}`), or of anything else thrown. */
export function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String(err.message);
  return String(err);
}
