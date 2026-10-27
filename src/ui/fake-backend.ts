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
    dialogCalls: 0,
    /** When set, the matching call rejects with this error. */
    fail: {} as Partial<Record<"openDialog" | "getConfig" | "setConfig", unknown>>,
    /** When set, reads wait for it. */
    readGate: undefined as Promise<void> | undefined,
    emitOpenFiles: (paths: string[]) => openFiles(paths),
  };
  const failing = (call: keyof typeof state.fail) => {
    if (call in state.fail) throw state.fail[call];
  };
  const backend: Backend = {
    takeOpenFiles: async () => launch.splice(0),
    openDialog: async () => {
      state.dialogCalls++;
      await state.readGate;
      failing("openDialog");
      return state.dialogPaths;
    },
    readDocument: async (path) => {
      await state.readGate;
      if (!(path in files)) throw { kind: "not_found", message: `${path}: not found` };
      return { path, text: files[path], mtime_ms: 0 };
    },
    getConfig: async () => {
      failing("getConfig");
      return structuredClone(state.config);
    },
    setConfig: async (config) => {
      failing("setConfig");
      state.config = config;
    },
    openExternal: async (url) => {
      state.external.push(url);
    },
    onOpenFiles: async (handler) => {
      openFiles = handler;
      return () => {
        openFiles = () => {};
      };
    },
  };
  return { backend, state };
}

/** Lets pending promise callbacks run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A promise and the function that resolves it. */
export function gate(): { promise: Promise<void>; open: () => void } {
  let open = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
