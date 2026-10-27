import MarkdownIt from "markdown-it";
import { extras } from "./extras";
import { gfm } from "./gfm";

/** Plain CommonMark: what the GFM renderer extends, kept for the conformance test. */
export const commonmark = new MarkdownIt("commonmark");
export const md = new MarkdownIt("commonmark").use(gfm).use(extras);

export function render(source: string): string {
  return md.render(source);
}
