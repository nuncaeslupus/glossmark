import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { strings } from "../../strings";

const LANGUAGE = /(?:^|\s)language-(\S+)/;
const COPIED_MS = 1500;

/** Highlight fenced code with a known language and give every code block a copy button.
 * Mermaid fences are left to the Mermaid enhancer. */
// ponytail: highlight.js's common subset (36 languages); other languages show as plain code.
export function highlightCode(root: ParentNode): void {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code")) {
    const pre = code.parentElement;
    if (!pre || pre.parentElement?.classList.contains("code-block")) continue;
    const language = LANGUAGE.exec(code.className)?.[1];
    if (language === "mermaid") continue;
    const source = code.textContent ?? "";
    if (language && hljs.getLanguage(language)) {
      // hljs escapes the text it is given, so its markup is trusted.
      code.innerHTML = hljs.highlight(source, { language, ignoreIllegals: true }).value;
      code.classList.add("hljs");
    }

    const block = document.createElement("div");
    block.className = "code-block";
    pre.replaceWith(block);
    block.append(pre, copyButton(source));
  }
}

function copyButton(source: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy";
  // The label is drawn from `aria-label` in CSS, so it never shows up in find or a text copy.
  const label = (text: string) => button.setAttribute("aria-label", text);
  label(strings.copyCode);
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(source);
    label(strings.copied);
    setTimeout(() => label(strings.copyCode), COPIED_MS);
  });
  return button;
}
