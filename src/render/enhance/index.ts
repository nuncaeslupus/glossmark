import { Anchors, type Heading } from "./anchors";
import "./enhance.css";
import { highlightCode } from "./highlight";
import { renderMath } from "./math";
import { renderMermaid } from "./mermaid";

export type { Heading } from "./anchors";
export { Anchors, renderMermaid };

export interface Enhanced {
  /** The headings in document order, for the outline. */
  outline: Heading[];
  /** Settles once the Mermaid diagrams are drawn (at once when there are none). */
  ready: Promise<void>;
}

/** Run the enhancers on sanitised HTML just inserted at `root`. Mermaid last, as it loads
 * lazily. */
export function enhance(root: HTMLElement): Enhanced {
  const anchors = new Anchors();
  enhancePart(root, anchors);
  anchors.link(root);
  return { outline: anchors.outline, ready: renderMermaid(root) };
}

/** The enhancers that work on one piece of a document, before it is inserted. Anchors come
 * first so heading slugs read the source text rather than typeset math. */
export function enhancePart(part: ParentNode, anchors: Anchors): void {
  anchors.add(part);
  highlightCode(part);
  renderMath(part);
}
