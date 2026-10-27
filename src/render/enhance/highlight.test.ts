import { expect, test, vi } from "vitest";
import { strings } from "../../strings";
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

test("test_copy_button_reports_success_and_failure", async () => {
  const el = document.createElement("article");
  el.innerHTML = sanitize(render("```js\nlet a = 1;\n```"));
  highlightCode(el);
  const button = el.querySelector<HTMLButtonElement>("button.copy");
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("no"));
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

  button?.click();
  await vi.waitFor(() => expect(button?.getAttribute("aria-label")).toBe(strings.copied));
  expect(writeText).toHaveBeenCalledWith("let a = 1;\n");
  button?.click();
  await vi.waitFor(() => expect(button?.getAttribute("aria-label")).toBe(strings.copyFailed));
});
