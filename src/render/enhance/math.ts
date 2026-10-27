import katex from "katex";
import "katex/dist/katex.min.css";

/** Typeset the `.math` placeholders the parser left, after sanitising: KaTeX's inline
 * styles and MathML come from trusted code reading the TeX as text, so they never pass
 * through the allowlist. */
export function renderMath(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(".math")) {
    if (el.querySelector(".katex")) continue;
    katex.render(el.textContent ?? "", el, {
      displayMode: el.classList.contains("math-display"),
      throwOnError: false,
    });
  }
}
