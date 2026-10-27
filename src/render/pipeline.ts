import MarkdownIt from "markdown-it";
import { extras } from "./extras";
import { gfm } from "./gfm";

/** Plain CommonMark: what the GFM renderer extends, kept for the conformance test. */
export const commonmark = new MarkdownIt("commonmark");
export const md = new MarkdownIt("commonmark").use(gfm).use(extras);

export function render(source: string): string {
  return md.render(source);
}

/** About how much HTML goes in one piece of a chunked render. */
export const CHUNK_CHARS = 32_000;
/** A piece grows past this many times its size only to keep a raw-HTML element whole. */
export const MAX_CHUNK_FACTOR = 8;

// Raw-HTML tags, to keep a `<details>` or `<div>` opened in one block and closed in a later
// one inside a single piece.
const TAG = /<(\/?)([a-zA-Z][\w-]*)[^>]*>/g;
const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
// Elements that never stay open across blocks: void ones, and those whose end tag is optional
// (an unclosed `<p align="center">` is closed by the next block).
// biome-ignore format: a dense list reads better than one entry per line
const UNCOUNTED = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source",
  "track", "wbr", "p", "li", "dt", "dd", "tr", "td", "th", "thead", "tbody", "tfoot",
  "colgroup", "caption", "option", "optgroup", "rt", "rp", "html", "head", "body",
]);

/** Count the raw-HTML elements `html` leaves open, by name, into `open`. */
function track(open: Map<string, number>, html: string): void {
  for (const [tag, close, raw] of html.replace(COMMENT, "").matchAll(TAG)) {
    const name = raw.toLowerCase();
    if (UNCOUNTED.has(name) || (!close && tag.endsWith("/>"))) continue;
    const n = (open.get(name) ?? 0) + (close ? -1 : 1);
    if (n > 0) open.set(name, n);
    else open.delete(name);
  }
}

/** The same HTML as `render`, in pieces of about `size` characters cut between top-level
 * blocks, so each can be sanitised and inserted in its own task. A piece does not split a
 * raw-HTML element across two, unless the element stays open for `MAX_CHUNK_FACTOR`
 * pieces' worth. */
// ponytail: past that cap the cut closes the element early, as if its end tag came there.
export function renderChunks(source: string, size = CHUNK_CHARS): string[] {
  const env = {};
  const tokens = md.parse(source, env);
  const chunks: string[] = [];
  const open = new Map<string, number>();
  let chunk = "";
  let start = 0;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    depth += token.nesting;
    if (token.type === "html_block") track(open, token.content);
    if (depth !== 0) continue;
    chunk += md.renderer.render(tokens.slice(start, i + 1), md.options, env);
    start = i + 1;
    if (chunk.length >= size && (open.size === 0 || chunk.length >= size * MAX_CHUNK_FACTOR)) {
      chunks.push(chunk);
      chunk = "";
      open.clear();
    }
  }
  chunk += md.renderer.render(tokens.slice(start), md.options, env);
  if (chunk) chunks.push(chunk);
  return chunks;
}
