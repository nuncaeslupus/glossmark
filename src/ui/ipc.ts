import { invoke } from "@tauri-apps/api/core";
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

/** The Rust core, as the shell sees it; tests pass a fake. */
export interface Backend {
  takeOpenFiles(): Promise<string[]>;
  openDialog(): Promise<string[]>;
  readDocument(path: string): Promise<Doc>;
  getConfig(): Promise<Config>;
  setConfig(config: Config): Promise<void>;
  openExternal(url: string): Promise<void>;
  onOpenFiles(handler: (paths: string[]) => void): Promise<void>;
}

interface OpenFiles {
  paths: string[];
}

export const tauriBackend: Backend = {
  takeOpenFiles: () => invoke<OpenFiles>("take_open_files").then((r) => r.paths),
  openDialog: () => invoke<OpenFiles>("open_dialog").then((r) => r.paths),
  readDocument: (path) => invoke<Doc>("read_document", { path }),
  getConfig: () => invoke<Config>("get_config"),
  setConfig: (config) => invoke<void>("set_config", { config }),
  openExternal: (url) => invoke<void>("open_external", { url }),
  onOpenFiles: (handler) =>
    listen<OpenFiles>("open-files", (e) => handler(e.payload.paths)).then(() => undefined),
};

/** The message of an `IpcError` (`{kind, message}`), or of anything else thrown. */
export function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) return String(err.message);
  return String(err);
}
