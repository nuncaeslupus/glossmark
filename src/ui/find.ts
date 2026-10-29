// Find in page: our own search over text nodes, since `window.find` is unreliable in WebKitGTK.

const MATCH = "find-match";
const MARK_RE = /\p{M}/u;
const NON_ASCII = /[\u0080-\uffff]/;
// Text a reader does not see as the document's: diagram internals, KaTeX's MathML copy, the
// copy buttons and the reload notice.
const SKIP = "script, style, svg, button, .katex-mathml, .file-notice";

export interface Found {
  /** The marks, in document order. */
  marks: HTMLElement[];
  /** Whether the search stopped at the limit with matches left. */
  more: boolean;
}

const folds = new Map<string, string>();

/** One character folded: lower case, accents dropped ("É" → "e"), final sigma as sigma. NFC
 * after stripping keeps Hangul syllables whole. */
function foldChar(ch: string): string {
  let f = folds.get(ch);
  if (f === undefined) {
    f = ch
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/ς/g, "σ");
    folds.set(ch, f);
  }
  return f;
}

/** `text` folded for matching, with each folded code unit's index in `text`, so a match maps
 * back to the original span (`null` when the two are the same). */
function fold(text: string): { folded: string; at: number[] | null } {
  // Plain ASCII, the bulk of most documents: lower case only, and offsets map one to one.
  if (!NON_ASCII.test(text)) return { folded: text.toLowerCase(), at: null };
  const parts: string[] = [];
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      // ASCII, the bulk of most documents: lower case is all there is to do.
      parts.push(code >= 65 && code <= 90 ? String.fromCharCode(code + 32) : (text[i] as string));
      at.push(i);
      i++;
      continue;
    }
    const ch = String.fromCodePoint(text.codePointAt(i) as number);
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) at.push(i);
    parts.push(f);
    i += ch.length;
  }
  at.push(text.length);
  return { folded: parts.join(""), at };
}

/** Wraps each occurrence of `query` under `root` in `<mark class="find-match">`, ignoring case
 * and accents, at most `limit` of them, so a common word in a large document stays quick.
 * Earlier matches are removed first. */
export function highlightMatches(root: HTMLElement, query: string, limit = Infinity): Found {
  clearMatches(root);
  const marks: HTMLElement[] = [];
  const needle = fold(query).folded;
  if (!needle) return { marks, more: false };
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    // ponytail: a match must sit within one text node, so `foo **bar**` does not find "foo bar".
    const { folded, at: map } = fold(node.data);
    const at = (i: number) => (map ? (map[i] as number) : i);
    let rest = node;
    let consumed = 0;
    for (let hit = folded.indexOf(needle); hit >= 0; ) {
      if (marks.length === limit) return { marks, more: true };
      const start = at(hit);
      // The match ends after the original character its last folded unit came from.
      const last = at(hit + needle.length - 1);
      let end = last + ((node.data.codePointAt(last) as number) > 0xffff ? 2 : 1);
      // ...and any accents written after it as separate marks.
      for (
        let c = node.data.codePointAt(end);
        c !== undefined && MARK_RE.test(String.fromCodePoint(c));
        c = node.data.codePointAt(end)
      ) {
        end += c > 0xffff ? 2 : 1;
      }
      const match = rest.splitText(start - consumed);
      rest = match.splitText(end - start);
      const mark = doc.createElement("mark");
      mark.className = MATCH;
      match.replaceWith(mark);
      mark.append(match);
      marks.push(mark);
      consumed = end;
      // Resume at the first folded unit of a character after the match.
      let next = hit + needle.length;
      while (next < folded.length && at(next) < end) next++;
      hit = folded.indexOf(needle, next);
    }
  }
  return { marks, more: false };
}

/** Removes the marks `highlightMatches` added, leaving the text as it was. */
export function clearMatches(root: HTMLElement): void {
  for (const mark of root.querySelectorAll(`mark.${MATCH}`)) {
    const parent = mark.parentNode;
    mark.replaceWith(...mark.childNodes);
    parent?.normalize();
  }
}
