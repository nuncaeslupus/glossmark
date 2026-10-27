import { expect, test } from "vitest";
import { render } from "../pipeline";
import { sanitize } from "../sanitize";
import { highlightCode } from "./highlight";

test("test_highlight_known_languages_and_copy_buttons", () => {
  const el = document.createElement("article");
  el.innerHTML = sanitize(
    render(
      "```ts\nlet a = 1;\n```\n\n```nosuchlang\nx\n```\n\n    plain\n\n```mermaid\ngraph LR\n```",
    ),
  );
  highlightCode(el);
  highlightCode(el);

  expect(el.querySelector("code.language-ts.hljs .hljs-keyword")?.textContent).toBe("let");
  expect(el.querySelector("code.language-nosuchlang")?.innerHTML).toBe("x\n");
  // Every block but the Mermaid fence gets one copy button, also on a second run.
  expect(el.querySelectorAll(".code-block > button.copy")).toHaveLength(3);
  expect(el.querySelector("code.language-mermaid")?.closest(".code-block")).toBeNull();
});
