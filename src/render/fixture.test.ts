import { expect, test } from "vitest";
import fixture from "../../docs/fixtures/all-features.md?raw";
import { renderMath } from "./enhance/math";
import { render } from "./pipeline";
import { sanitize } from "./sanitize";

// The fixture as the app shows it: parsed, sanitised, inserted, then math typeset.
const insert = (source: string) => {
  const el = document.createElement("article");
  el.innerHTML = sanitize(render(source));
  renderMath(el);
  return el;
};

const text = (nodes: NodeListOf<Element>) => [...nodes].map((n) => n.textContent?.trim());

test("test_feature_fixture_parser_constructs_present", () => {
  const el = insert(fixture);

  expect(el.querySelector("mark")?.textContent).toBe("Highlighted text");
  expect(el.querySelector("sup:not(.footnote-ref)")?.textContent).toBe("th");
  expect(el.querySelector("sub")?.textContent).toBe("2");
  // Abbreviations apply document-wide, so "HTML" in a later heading is marked too.
  expect([...el.querySelectorAll("abbr")].map((a) => a.title).slice(0, 2)).toEqual([
    "Hyper Text Markup Language",
    "World Wide Web Consortium",
  ]);
  expect(text(el.querySelectorAll("dl > dt"))).toEqual(["Term", "Another term"]);
  expect(el.querySelectorAll("dl > dd")).toHaveLength(2);

  expect(el.querySelector(".math-inline > .katex")).not.toBeNull();
  expect(el.querySelector(".math-display .katex-display")).not.toBeNull();
  expect(el.querySelector(".katex-error")).toBeNull();

  const alerts = [...el.querySelectorAll(".markdown-alert")];
  expect(alerts.map((a) => a.classList[1])).toEqual(
    ["note", "tip", "important", "warning", "caution"].map((t) => `markdown-alert-${t}`),
  );
  expect(text(el.querySelectorAll(".markdown-alert-title"))).toEqual([
    "Note",
    "Tip",
    "Important",
    "Warning",
    "Caution",
  ]);

  // Footnotes: the reference and the back-reference each point at an id that survived.
  const footnotes = el.querySelector("section.footnotes");
  expect(footnotes?.textContent).toContain("The footnote text.");
  for (const a of el.querySelectorAll<HTMLAnchorElement>(".footnote-ref a, .footnote-backref")) {
    const target = a.getAttribute("href") ?? "";
    expect(target.startsWith("#") && el.querySelector(target), target).toBeTruthy();
  }

  expect(el.textContent).toContain("Shortcodes become characters: 🎉 😄");
  expect(el.textContent).not.toMatch(/:tada:|:smile:/);

  const wiki = [...el.querySelectorAll<HTMLAnchorElement>("a.wikilink")];
  expect(wiki.map((a) => [a.getAttribute("href"), a.textContent])).toEqual([
    ["Another%20page.md", "Another page"],
    ["Another%20page.md", "another label"],
  ]);
  expect(wiki.some((a) => a.hasAttribute("data-external"))).toBe(false);

  // Front matter: a metadata table above the title, not a rule and a setext heading.
  const meta = el.firstElementChild;
  expect(meta?.matches("table.front-matter")).toBe(true);
  expect(text(el.querySelectorAll(".front-matter th"))).toEqual(["title", "author", "tags"]);
  expect(text(el.querySelectorAll(".front-matter td"))).toEqual([
    "All features",
    "Glossmark",
    "fixture",
  ]);
  expect(meta?.nextElementSibling?.tagName).toBe("H1");
});

test("test_extras_edge_cases", () => {
  const html = (s: string) => render(s).trim();
  // Dollars that are not math: prices, a space inside the delimiter, an escaped dollar.
  expect(html("costs $5 and $6")).not.toContain("math");
  expect(html("$ x $")).not.toContain("math");
  expect(html("\\$x$")).not.toContain("math");
  expect(html("$$x$$")).toBe('<div class="math math-display">x</div>');
  expect(html("a $x<y$ b")).toBe('<p>a <span class="math math-inline">x&lt;y</span> b</p>');
  expect(html("[[Notes#Setup]]")).toBe(
    '<p><a href="Notes.md#Setup" class="wikilink">Notes#Setup</a></p>',
  );
  expect(html("[[page.md]]")).toContain('href="page.md"');
  expect(html("---\nlist:\n  - a\n---")).toContain('<pre class="front-matter">');
  expect(html("---\n---")).toBe("");
  expect(html(":) :-)")).toBe("<p>:) :-)</p>");
});
