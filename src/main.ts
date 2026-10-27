import { type Backend, tauriBackend } from "./ui/ipc";
import { Shell } from "./ui/shell";

/** Draw the window, then open the launch's files and those that arrive later. */
export async function start(root: HTMLElement, backend: Backend = tauriBackend): Promise<Shell> {
  const shell = new Shell(root, backend);
  await shell.start();
  return shell;
}

const root = document.getElementById("app");
if (root) start(root).catch(console.error);
