import type { Heading } from "../render/enhance";

/** An outline entry and the heading it jumps to. */
export interface Section {
  heading: Heading;
  node: HTMLElement;
}

const HEADINGS = "h1, h2, h3, h4, h5, h6";
/** How far below the canvas's top edge a heading still counts as reached. */
const SLACK_PX = 8;

/** Pairs `enhance`'s outline with the headings in `sheet`. */
export function sections(sheet: HTMLElement, outline: Heading[]): Section[] {
  const byId = new Map([...sheet.querySelectorAll<HTMLElement>(HEADINGS)].map((n) => [n.id, n]));
  return outline.flatMap((heading) => {
    const node = byId.get(heading.id);
    return node ? [{ heading, node }] : [];
  });
}

/** The section being read: the last heading at or above the canvas's top edge, else the first.
 * -1 when there are no headings. */
export function currentSection(canvas: HTMLElement, list: Section[]): number {
  if (list.length === 0) return -1;
  // ponytail: sections near the end never reach the top edge, so at the bottom the last is current.
  const { scrollTop, clientHeight, scrollHeight } = canvas;
  if (scrollTop > 0 && scrollTop + clientHeight >= scrollHeight - 1) return list.length - 1;
  const top = canvas.getBoundingClientRect().top + SLACK_PX;
  let current = 0;
  for (const [i, { node }] of list.entries()) {
    if (node.getBoundingClientRect().top > top) break;
    current = i;
  }
  return current;
}
