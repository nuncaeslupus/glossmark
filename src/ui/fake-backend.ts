import type { Backend, Config } from "./ipc";

/** An in-memory Rust core for tests: `files` maps a path to its Markdown. */
export function fakeBackend(files: Record<string, string>, launch: string[] = []) {
  let openFiles: (paths: string[]) => void = () => {};
  const state = {
    config: {
      version: 1,
      theme: "system",
      defaultZoom: 100,
      remoteImages: true,
      recentFiles: [],
    } as Config,
    external: [] as string[],
    dialogPaths: [] as string[],
    emitOpenFiles: (paths: string[]) => openFiles(paths),
  };
  const backend: Backend = {
    takeOpenFiles: async () => launch.splice(0),
    openDialog: async () => state.dialogPaths,
    readDocument: async (path) => {
      if (!(path in files)) throw { kind: "not_found", message: `${path}: not found` };
      return { path, text: files[path], mtime_ms: 0 };
    },
    getConfig: async () => structuredClone(state.config),
    setConfig: async (config) => {
      state.config = config;
    },
    openExternal: async (url) => {
      state.external.push(url);
    },
    onOpenFiles: async (handler) => {
      openFiles = handler;
    },
  };
  return { backend, state };
}

/** Lets pending promise callbacks run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
