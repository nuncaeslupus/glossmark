import type { MarkdownIt, RendererRule, StateCore, Token } from "markdown-it";

// GFM's extensions on top of markdown-it's own tables and strikethrough, matched to the
// output of github/cmark-gfm's spec (0.29-gfm): `align=` rather than `style=`, `<del>`,
// task-list checkboxes, extended autolinks and the disallowed-raw-HTML tag filter.

// Tag filter: these tags have their `<` escaped wherever raw HTML appears.
const FILTERED =
  /<(?=\/?(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?:[\s/>]|$))/gi;

// Extended autolinks. A link can start only at the start of a text run or after whitespace,
// `*`, `_`, `~` or `(`.
const BOUNDARY = /[\s*_~(]/;
const URL_START = /^(?:www\.|https?:\/\/|ftp:\/\/)/;
const DOMAIN = /^[\w-]+(?:\.[\w-]+)*/;
const EMAIL = /^[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const TRAILING = new Set("?!.,:*_~");
const ENTITY_END = /&[a-zA-Z0-9]+;$/;

/** The URL autolink starting at `s[i]`, trailing punctuation trimmed, or null. */
function matchUrl(s: string, i: number): string | null {
  const prefix = URL_START.exec(s.slice(i));
  if (!prefix) return null;
  const domain = DOMAIN.exec(s.slice(i + prefix[0].length));
  if (!domain) return null;
  // A valid domain has a period and no underscore in its last two segments.
  const host = prefix[0] === "www." ? `www.${domain[0]}` : domain[0];
  const segments = host.split(".");
  if (segments.length < 2 || segments.slice(-2).some((p) => p.includes("_"))) return null;

  let end = i + prefix[0].length + domain[0].length;
  while (end < s.length && !/[\s<]/.test(s[end])) end++;
  let link = s.slice(i, end);
  let unbalanced = count(link, ")") - count(link, "(");
  for (;;) {
    const last = link[link.length - 1];
    if (TRAILING.has(last)) link = link.slice(0, -1);
    else if (last === ")" && unbalanced > 0) {
      link = link.slice(0, -1);
      unbalanced--;
    } else if (last === ";" && ENTITY_END.test(link)) link = link.replace(ENTITY_END, "");
    else return link;
  }
}

function matchEmail(s: string, i: number): string | null {
  const m = EMAIL.exec(s.slice(i));
  return m && !/[-_]$/.test(m[0]) ? m[0] : null;
}

const count = (s: string, c: string) => s.split(c).length - 1;

function linkTokens(state: StateCore, md: MarkdownIt, text: string, href: string) {
  const open = new state.Token("link_open", "a", 1);
  open.attrs = [["href", md.normalizeLink(href)]];
  open.markup = "linkify";
  open.info = "auto";
  const body = new state.Token("text", "", 0);
  body.content = text;
  const close = new state.Token("link_close", "a", -1);
  close.markup = "linkify";
  close.info = "auto";
  return [open, body, close];
}

/** Split one text token into text and autolink tokens. */
function autolink(state: StateCore, md: MarkdownIt, token: Token): Token[] | null {
  const s = token.content;
  const out: Token[] = [];
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && !BOUNDARY.test(s[i - 1])) continue;
    let text = matchUrl(s, i);
    let href = text && (text.startsWith("www.") ? `http://${text}` : text);
    if (!text) {
      text = matchEmail(s, i);
      href = text && `mailto:${text}`;
    }
    // mdurl blanks a host over 255 characters; leave such text alone.
    if (!text || !href || /^https?:\/\/$/.test(md.normalizeLink(href))) continue;
    if (i > from)
      out.push(Object.assign(new state.Token("text", "", 0), { content: s.slice(from, i) }));
    out.push(...linkTokens(state, md, text, href));
    from = i + text.length;
    i = from - 1;
  }
  if (from === 0) return null;
  if (from < s.length)
    out.push(Object.assign(new state.Token("text", "", 0), { content: s.slice(from) }));
  return out;
}

const TASK = /^\[([ xX])\](?=[ \t])/;

export function gfm(md: MarkdownIt): void {
  md.enable(["table", "strikethrough"]);

  const align: RendererRule = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    const style = String(token.attrGet("style") ?? "").match(/^text-align:(\w+)$/);
    if (style) token.attrs = [["align", style[1]]];
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.th_open = align;
  md.renderer.rules.td_open = align;
  md.renderer.rules.s_open = () => "<del>";
  md.renderer.rules.s_close = () => "</del>";

  for (const rule of ["html_block", "html_inline"] as const) {
    md.renderer.rules[rule] = (tokens, idx) => tokens[idx].content.replace(FILTERED, "&lt;");
  }

  md.core.ruler.after("text_join", "gfm_autolink", (state) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      const children: Token[] = [];
      let depth = 0;
      for (const child of block.children) {
        if (child.type === "link_open") depth++;
        if (child.type === "link_close") depth--;
        const split = depth === 0 && child.type === "text" ? autolink(state, md, child) : null;
        if (split) for (const t of split) t.level = child.level;
        children.push(...(split ?? [child]));
      }
      block.children = children;
    }
  });

  md.core.ruler.after("gfm_autolink", "gfm_task_list", (state) => {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      const first = tokens[i].children?.[0];
      if (tokens[i - 2].type !== "list_item_open" || tokens[i - 1].type !== "paragraph_open")
        continue;
      if (first?.type !== "text") continue;
      const m = TASK.exec(first.content);
      if (!m) continue;
      const box = new state.Token("html_inline", "", 0);
      box.content = `<input ${m[1] === " " ? "" : 'checked="" '}disabled="" type="checkbox">`;
      first.content = first.content.slice(m[0].length);
      tokens[i].children?.unshift(box);
    }
  });
}
