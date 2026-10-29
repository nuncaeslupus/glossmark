// Find in page: our own search over text nodes, since `window.find` is unreliable in WebKitGTK.

const MATCH = "find-match";
// Text a reader does not see as the document's: diagram internals, KaTeX's MathML copy, the
// copy buttons and the reload notice.
const SKIP = "script, style, svg, button, .katex-mathml, .file-notice";

export interface Found {
  /** The marks, in document order. */
  marks: HTMLElement[];
  /** Whether the search stopped at the limit with matches left. */
  more: boolean;
}

/** `text` folded for matching: lower case, accents dropped ("É" → "e"), with each folded
 * code unit's index in `text`, so a match maps back to the original span. */
function fold(text: string): { folded: string; at: number[] } {
  let folded = "";
  const at: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i) as number);
    const f = ch.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
    i += ch.length;
  }
  at.push(text.length);
  return { folded, at };
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
    const { folded, at } = fold(node.data);
    let rest = node;
    let consumed = 0;
    for (let hit = folded.indexOf(needle); hit >= 0; ) {
      if (marks.length === limit) return { marks, more: true };
      const start = at[hit] as number;
      // The match ends after the original character its last folded unit came from.
      const last = at[hit + needle.length - 1] as number;
      let end = last + ((node.data.codePointAt(last) as number) > 0xffff ? 2 : 1);
      // ...and any accents written after it as separate marks.
      while (end < node.data.length && /\p{M}/u.test(node.data[end] as string)) end++;
      const match = rest.splitText(start - consumed);
      rest = match.splitText(end - start);
      const mark = doc.createElement("mark");
      mark.className = MATCH;
      match.replaceWith(mark);
      mark.append(match);
      marks.push(mark);
      consumed = end;
      const next = at.findIndex((i) => i >= end);
      hit = next < 0 ? -1 : folded.indexOf(needle, next);
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
