import type { Backend } from "./ipc";

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/**
 * Watches `path` until the returned function is called. A failed watch is never unwatched:
 * the core counts watchers per path, and an extra `unwatch` would end another tab's watch.
 */
export function watchFile(backend: Backend, path: string, onFail: () => void): () => void {
  const watching = backend.watch(path).then(
    () => true,
    () => {
      onFail();
      return false;
    },
  );
  return () => {
    void watching.then((ok) => {
      if (ok) return backend.unwatch(path).catch(() => {});
    });
  };
}

/** Where the reader is: the heading at or above the top edge, and how far above it is. */
export interface ScrollAnchor {
  scrollTop: number;
  heading?: { text: string; occurrence: number; offset: number };
}

function headingKeys(
  sheet: HTMLElement,
): { node: HTMLElement; text: string; occurrence: number }[] {
  const seen = new Map<string, number>();
  return [...sheet.querySelectorAll<HTMLElement>(HEADINGS)].map((node) => {
    const text = node.textContent ?? "";
    const occurrence = seen.get(text) ?? 0;
    seen.set(text, occurrence + 1);
    return { node, text, occurrence };
  });
}

const offsetIn = (canvas: HTMLElement, node: HTMLElement) =>
  node.getBoundingClientRect().top - canvas.getBoundingClientRect().top;

export function scrollAnchor(canvas: HTMLElement, sheet: HTMLElement): ScrollAnchor {
  const anchor: ScrollAnchor = { scrollTop: canvas.scrollTop };
  // A hidden tab has no layout to measure; it keeps its offset.
  if (canvas.hidden) return anchor;
  for (const key of headingKeys(sheet)) {
    const offset = offsetIn(canvas, key.node);
    if (offset > 1) break;
    anchor.heading = { text: key.text, occurrence: key.occurrence, offset };
  }
  return anchor;
}

/** Puts the anchor's heading back where it was; without one, the old offset stays. */
export function restoreScroll(canvas: HTMLElement, sheet: HTMLElement, anchor: ScrollAnchor): void {
  canvas.scrollTop = anchor.scrollTop;
  const { heading } = anchor;
  if (!heading || canvas.hidden) return;
  // ponytail: matched by text and occurrence; a renamed heading falls back to the offset.
  const match = headingKeys(sheet).find(
    (k) => k.text === heading.text && k.occurrence === heading.occurrence,
  );
  if (match) canvas.scrollTop += offsetIn(canvas, match.node) - heading.offset;
}
