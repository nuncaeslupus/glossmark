import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

/** The Rust core, as the shell sees it; tests pass a fake. */
export interface Backend {
  takeOpenFiles(): Promise<string[]>;
  openDialog(): Promise<string[]>;
  readDocument(path: string): Promise<Doc>;
  /** The markup of a local SVG, for inlining after sanitising (2 MB cap). */
  readSvg(path: string): Promise<string>;
  /** The asset-protocol URL of a local file, for `<img src>`. */
  assetUrl(path: string): string;
  getConfig(): Promise<Config>;
  setConfig(config: Config): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Watching is reference-counted in the core: each `watch` needs its own `unwatch`. */
  watch(path: string): Promise<void>;
  unwatch(path: string): Promise<void>;
  /** Resolves to the function that stops listening. */
  onOpenFiles(handler: (paths: string[]) => void): Promise<() => void>;
  onDocumentChanged(handler: (change: DocumentChanged) => void): Promise<() => void>;
}

interface OpenFiles {
  paths: string[];
}

export const tauriBackend: Backend = {
  takeOpenFiles: () => invoke<OpenFiles>("take_open_files").then((r) => r.paths),
  openDialog: () => invoke<OpenFiles>("open_dialog").then((r) => r.paths),
  readDocument: (path) => invoke<Doc>("read_document", { path }),
  readSvg: (path) => invoke<{ svg: string }>("read_svg", { path }).then((r) => r.svg),
  assetUrl: (path) => convertFileSrc(path),
  getConfig: () => invoke<Config>("get_config"),
  setConfig: (config) => invoke<void>("set_config", { config }),
  openExternal: (url) => invoke<void>("open_external", { url }),
  watch: (path) => invoke<void>("watch", { path }),
  unwatch: (path) => invoke<void>("unwatch", { path }),
  onOpenFiles: (handler) => listen<OpenFiles>("open-files", (e) => handler(e.payload.paths)),
  onDocumentChanged: (handler) =>
    listen<DocumentChanged>("document-changed", (e) => handler(e.payload)),
};

/** The message of an `IpcError` (`{kind, message}`), or of anything else thrown. */
export function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String(err.message);
  return String(err);
}
