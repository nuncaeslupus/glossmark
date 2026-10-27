// Find in page: our own search over text nodes, since `window.find` is unreliable in WebKitGTK.

const MATCH = "find-match";
// Text a reader does not see as the document's: diagram internals, KaTeX's MathML copy, the
// copy buttons and the reload notice.
const SKIP = "script, style, svg, button, .katex-mathml, .file-notice";

/** Wraps each case-insensitive occurrence of `query` under `root` in `<mark class="find-match">`
 * and returns the marks in document order. Earlier matches are removed first. */
export function highlightMatches(root: HTMLElement, query: string): HTMLElement[] {
  clearMatches(root);
  if (!query) return [];
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  const marks: HTMLElement[] = [];
  const needle = query.toLowerCase();
  for (const node of nodes) {
    // ponytail: a match must sit within one text node, so `foo **bar**` does not find "foo bar";
    // text whose lower case changes length (e.g. "İ") is matched case-sensitively.
    const lower = node.data.toLowerCase();
    const [hay, want] = lower.length === node.data.length ? [lower, needle] : [node.data, query];
    let rest = node;
    let consumed = 0;
    for (let at = hay.indexOf(want); at >= 0; at = hay.indexOf(want, consumed)) {
      const match = rest.splitText(at - consumed);
      rest = match.splitText(want.length);
      const mark = doc.createElement("mark");
      mark.className = MATCH;
      match.replaceWith(mark);
      mark.append(match);
      marks.push(mark);
      consumed = at + want.length;
    }
  }
  return marks;
}

/** Removes the marks `highlightMatches` added, leaving the text as it was. */
export function clearMatches(root: HTMLElement): void {
  for (const mark of root.querySelectorAll(`mark.${MATCH}`)) {
    const parent = mark.parentNode;
    mark.replaceWith(...mark.childNodes);
    parent?.normalize();
  }
}
