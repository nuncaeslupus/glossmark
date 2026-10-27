const FENCES = "pre > code.language-mermaid";

let count = 0;

/** Replace each `mermaid` fence with its diagram. Mermaid (~2 MB) is imported only when the
 * document has one. Its SVG is inserted after sanitising: trusted code drew it, with
 * `securityLevel: 'strict'` so labels cannot carry HTML or script. A diagram that fails to
 * parse stays as its source. */
export async function renderMermaid(root: ParentNode): Promise<void> {
  const fences = [...root.querySelectorAll<HTMLElement>(FENCES)];
  if (fences.length === 0) return;
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true });
  for (const code of fences) {
    const pre = code.parentElement;
    if (!pre) continue;
    const id = `glossmark-mermaid-${++count}`;
    try {
      const { svg } = await mermaid.render(id, code.textContent ?? "");
      const figure = document.createElement("div");
      figure.className = "mermaid";
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (error) {
      // Mermaid draws in a temporary element on `body`; a failed draw can leave it behind.
      for (const tmp of [`d${id}`, id]) document.getElementById(tmp)?.remove();
      pre.classList.add("mermaid-error");
      pre.title = String(error);
    }
  }
}
