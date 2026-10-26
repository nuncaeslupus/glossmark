import MarkdownIt from "markdown-it";

export const md = new MarkdownIt("commonmark");

export function render(source: string): string {
  return md.render(source);
}
