import { addAnchors, type Heading } from "./anchors";
import "./enhance.css";
import { highlightCode } from "./highlight";
import { renderMath } from "./math";
import { renderMermaid } from "./mermaid";

export type { Heading } from "./anchors";

export interface Enhanced {
  /** The headings in document order, for the outline. */
  outline: Heading[];
  /** Settles once the Mermaid diagrams are drawn (at once when there are none). */
  ready: Promise<void>;
}

/** Run the enhancers on sanitised HTML just inserted at `root`. Anchors come first so heading
 * slugs read the source text rather than typeset math; Mermaid last, as it loads lazily. */
export function enhance(root: HTMLElement): Enhanced {
  const outline = addAnchors(root);
  highlightCode(root);
  renderMath(root);
  return { outline, ready: renderMermaid(root) };
}
