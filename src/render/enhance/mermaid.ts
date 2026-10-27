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
  mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
  for (const code of fences) {
    const pre = code.parentElement;
    if (!pre) continue;
    try {
      const { svg } = await mermaid.render(`glossmark-mermaid-${++count}`, code.textContent ?? "");
      const figure = document.createElement("div");
      figure.className = "mermaid";
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (error) {
      pre.classList.add("mermaid-error");
      pre.title = String(error);
    }
  }
}
