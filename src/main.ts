import { strings } from "./strings";

/** Render the window for the given documents; with none, the empty state. */
export function boot(root: HTMLElement, paths: string[]): void {
  if (paths.length === 0) {
    const empty = document.createElement("main");
    empty.className = "empty";
    empty.textContent = strings.emptyState;
    root.replaceChildren(empty);
  }
}

const root = document.getElementById("app");
if (root) boot(root, []);
