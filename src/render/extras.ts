import type { MarkdownIt, StateBlock, StateInline } from "markdown-it";
import abbr from "markdown-it-abbr";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import frontMatter from "markdown-it-front-matter";
import alerts from "markdown-it-github-alerts";
import mark from "markdown-it-mark";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";

// The extras beyond GFM (D-7): maintained plugins, plus three small local rules where no
// plugin fits. Math is parsed here and only typeset after sanitising (enhance/math.ts).

/** `$…$` and `$$…$$` inside a paragraph, as pandoc reads dollars: no space inside the
 * single-dollar delimiters and no digit right after the closing one. */
function mathInline(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  const start = state.pos;
  if (src[start] !== "$") return false;
  const delim = src[start + 1] === "$" ? "$$" : "$";
  const open = start + delim.length;
  if (open >= state.posMax || /\s/.test(src[open])) return false;
  let end = open;
  for (;;) {
    end = src.indexOf(delim, end);
    if (end < 0 || end + delim.length > state.posMax) return false;
    const escaped = src[end - 1] === "\\";
    const bad = delim === "$" && (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? ""));
    if (end > open && !escaped && !bad) break;
    end++;
  }
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = delim;
    token.content = src.slice(open, end);
  }
  state.pos = end + delim.length;
  return true;
}

/** A `$$` block: opens a line, closes at the end of the same or a later line. */
function mathBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean) {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  const lineText = (n: number) =>
    state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
  const first = lineText(startLine);
  if (!first.startsWith("$$")) return false;
  let head = first.slice(2).trimEnd();
  let tail = "";
  let line = startLine;
  if (head.endsWith("$$")) head = head.slice(0, -2);
  else {
    for (line++; line < endLine; line++) {
      if (state.sCount[line] < state.blkIndent && !state.isEmpty(line)) return false;
      const text = lineText(line).trimEnd();
      if (text.endsWith("$$")) {
        tail = text.slice(0, -2);
        break;
      }
    }
    if (line >= endLine) return false;
  }
  if (silent) return true;
  const body = state.getLines(startLine + 1, line, state.sCount[startLine], false);
  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.markup = "$$";
  token.map = [startLine, line + 1];
  token.content = [head, body, tail].filter((s) => s.trim()).join("\n");
  state.line = line + 1;
  return true;
}

const WIKI = /^\[\[([^[\]|\n]+)(?:\|([^[\]\n]+))?\]\]/;

/** `[[Page]]`, `[[Page|label]]` and `[[Page#Heading]]`: a relative link to `Page.md`. */
function wikiLink(md: MarkdownIt) {
  return (state: StateInline, silent: boolean): boolean => {
    if (!state.src.startsWith("[[", state.pos)) return false;
    const m = WIKI.exec(state.src.slice(state.pos, state.posMax));
    if (!m) return false;
    const target = m[1].trim();
    const hash = target.indexOf("#");
    const page = hash < 0 ? target : target.slice(0, hash);
    const fragment = hash < 0 ? "" : target.slice(hash);
    const href = md.normalizeLink((page && !/\.md$/i.test(page) ? `${page}.md` : page) + fragment);
    if (!target || !md.validateLink(href)) return false;
    if (!silent) {
      const open = state.push("link_open", "a", 1);
      open.attrs = [
        ["href", href],
        ["class", "wikilink"],
      ];
      open.markup = "wikilink";
      state.push("text", "", 0).content = (m[2] ?? target).trim();
      state.push("link_close", "a", -1).markup = "wikilink";
    }
    state.pos += m[0].length;
    return true;
  };
}

const PAIR = /^([\w.-]+):[ \t]*(.*)$/;
const QUOTED = /^(["'])(.*)\1$/;

/** Front matter as GitHub shows it: a one-row table of its keys. YAML that is not a flat
 * `key: value` list is shown as source instead. */
// ponytail: flat keys only, no YAML parser; nested or multi-line front matter shows as source.
function frontMatterHtml(md: MarkdownIt, yaml: string): string {
  const esc = md.utils.escapeHtml;
  const lines = yaml.split("\n").filter((l) => l.trim() && !l.trimStart().startsWith("#"));
  if (lines.length === 0) return "";
  const pairs = lines.map((l) => PAIR.exec(l));
  if (pairs.some((p) => !p)) {
    return `<pre class="front-matter"><code class="language-yaml">${esc(yaml)}\n</code></pre>\n`;
  }
  const cells = (tag: string, values: string[]) =>
    values.map((v) => `<${tag}>${esc(v)}</${tag}>`).join("");
  const keys = pairs.map((p) => p?.[1] ?? "");
  const values = pairs.map((p) => (p?.[2] ?? "").replace(QUOTED, "$2"));
  return `<table class="front-matter"><thead><tr>${cells("th", keys)}</tr></thead><tbody><tr>${cells("td", values)}</tr></tbody></table>\n`;
}

export function extras(md: MarkdownIt): void {
  md.use(footnote)
    .use(deflist)
    .use(abbr)
    .use(mark)
    .use(sub)
    .use(sup)
    // GitHub converts `:name:` only, never `:)`-style shortcuts.
    .use(emoji, { shortcuts: {} })
    // No icons: GitHub's are inline SVG, which the sanitiser drops.
    .use(alerts, { icons: {} })
    .use(frontMatter, () => {});

  md.renderer.rules.front_matter = (tokens, idx) => frontMatterHtml(md, String(tokens[idx].meta));

  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.before("fence", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens, idx) => {
    const display = tokens[idx].markup === "$$" ? "display" : "inline";
    return `<span class="math math-${display}">${md.utils.escapeHtml(tokens[idx].content)}</span>`;
  };
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math math-display">${md.utils.escapeHtml(tokens[idx].content)}</div>\n`;

  md.inline.ruler.before("link", "wikilink", wikiLink(md));
}
