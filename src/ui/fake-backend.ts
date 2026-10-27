import type { Backend, Config, DocumentChanged } from "./ipc";

/** An in-memory Rust core for tests: `files` maps a path to its Markdown. */
export function fakeBackend(files: Record<string, string>, launch: string[] = []) {
  let openFiles: (paths: string[]) => void = () => {};
  let documentChanged: (change: DocumentChanged) => void = () => {};
  const mtimes: Record<string, number> = {};
  let clock = 1000;
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
    reads: 0,
    unwatchCalls: 0,
    /** When set, the matching call rejects with this error. */
    fail: {} as Partial<Record<"openDialog" | "getConfig" | "setConfig", unknown>>,
    /** When set, reads wait for it. */
    readGate: undefined as Promise<void> | undefined,
    /** Watchers per path, as the core counts them. */
    watched: {} as Record<string, number>,
    /** Paths whose `watch` rejects. */
    unwatchable: [] as string[],
    emitOpenFiles: (paths: string[]) => openFiles(paths),
    emitDocumentChanged: (change: DocumentChanged) => documentChanged(change),
    /** When set, the next read takes the file as it is now, then waits for this. */
    nextReadWaits: undefined as Promise<void> | undefined,
    /** An external save, by default with a newer mtime, and the event if the path is watched. */
    write: (path: string, text: string, mtime = ++clock) => {
      files[path] = text;
      mtimes[path] = mtime;
      if (state.watched[path]) documentChanged({ path, mtime_ms: mtime });
    },
    remove: (path: string) => {
      delete files[path];
      if (state.watched[path]) documentChanged({ path, deleted: true });
    },
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
      state.reads++;
      const waits = state.nextReadWaits;
      if (waits) {
        state.nextReadWaits = undefined;
        const snapshot = { path, text: files[path], mtime_ms: mtimes[path] ?? 0 };
        await waits;
        return snapshot;
      }
      await state.readGate;
      if (!(path in files)) throw { kind: "not_found", message: `${path}: not found` };
      return { path, text: files[path], mtime_ms: mtimes[path] ?? 0 };
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
    watch: async (path) => {
      if (state.unwatchable.includes(path)) throw { kind: "io", message: `${path}: no watch` };
      state.watched[path] = (state.watched[path] ?? 0) + 1;
    },
    unwatch: async (path) => {
      state.unwatchCalls++;
      if (state.watched[path]) state.watched[path]--;
    },
    onOpenFiles: async (handler) => {
      openFiles = handler;
      return () => {
        openFiles = () => {};
      };
    },
    onDocumentChanged: async (handler) => {
      documentChanged = handler;
      return () => {
        documentChanged = () => {};
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
