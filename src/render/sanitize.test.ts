import { expect, test } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json?raw";
import { render } from "./pipeline";
import { sanitize } from "./sanitize";

const insert = (source: string) => {
  const el = document.createElement("article");
  el.innerHTML = sanitize(render(source));
  return el;
};

const HOSTILE = `
<script>window.pwned = 1</script>

<img src="x.png" onerror="window.pwned = 1">

<div onclick="window.pwned = 1" onmouseover="x()">hover</div>

[click](javascript:alert(1)) <a href="JaVaScRiPt:alert(1)">raw</a> <a href=" javascript:x">sp</a>

<a href="data:text/html,<script>alert(1)</script>">data</a> <img src="data:image/svg+xml,x">

<iframe src="https://example.com"></iframe> <object data="x"></object> <embed src="x">

<svg><script>alert(1)</script></svg> <math><mi xlink:href="javascript:alert(1)">m</mi></math>

<form action="https://example.com"><input type="text" name="q"><button>go</button></form>

<style>body { display: none }</style> <link rel="stylesheet" href="x.css"> <base href="https://x">

<meta http-equiv="refresh" content="0;url=javascript:alert(1)">

<p style="background: url(javascript:alert(1))">styled</p>
`;

test("test_sanitize_hostile_fixture_nothing_executes", () => {
  const el = insert(HOSTILE);
  for (const tag of ["script", "iframe", "object", "embed", "form", "button", "style", "link"]) {
    expect(el.querySelector(tag), tag).toBeNull();
  }
  for (const tag of ["svg", "math", "base", "meta", "input[type=text]"]) {
    expect(el.querySelector(tag), tag).toBeNull();
  }
  const attrs = [...el.querySelectorAll("*")].flatMap((n) => [...n.attributes]);
  expect(attrs.filter((a) => a.name.startsWith("on")).map((a) => a.name)).toEqual([]);
  expect(attrs.filter((a) => a.name === "style")).toEqual([]);
  const urls = attrs.filter((a) => ["href", "src", "xlink:href"].includes(a.name));
  expect(urls.filter((a) => /^\s*javascript:/i.test(a.value))).toEqual([]);
  expect(el.querySelectorAll("a[href^='data:' i]")).toHaveLength(0);
  expect(el.querySelector("p")?.textContent).toContain("[click]"); // markdown-it left it inert
  expect(el.textContent).toContain("hover"); // the text stays, the handler goes
});

test("test_sanitize_safe_html_kept", () => {
  const el = insert(
    [
      "<details open><summary>More</summary>",
      "",
      "Press <kbd>Ctrl</kbd>+<kbd>C</kbd>, H<sub>2</sub>O, x<sup>2</sup>.",
      "",
      "</details>",
      "",
      '<img src="pic.png" alt="a picture" width="40">',
      "",
      "```js\nlet x = 1;\n```",
    ].join("\n"),
  );
  expect(el.querySelector("details[open] > summary")?.textContent).toBe("More");
  expect(el.querySelectorAll("kbd")).toHaveLength(2);
  expect(el.querySelector("sub")?.textContent).toBe("2");
  expect(el.querySelector("sup")?.textContent).toBe("2");
  const img = el.querySelector("img");
  expect([img?.getAttribute("src"), img?.alt, img?.getAttribute("width")]).toEqual([
    "pic.png",
    "a picture",
    "40",
  ]);
  expect(el.querySelector("code.language-js")).not.toBeNull();
});

test("test_sanitize_links_rewritten_to_safe_handlers", () => {
  const el = insert(
    '[web](https://example.com) [mail](mailto:a@b.c) [doc](other.md) [top](#a)\n\n<a href="https://x" target="_blank">t</a> <a href="//evil.com">p</a> <a href="\\\\evil.com">b</a>',
  );
  const links = [...el.querySelectorAll("a")];
  const external = links.filter((a) => a.hasAttribute("data-external")).map((a) => a.textContent);
  expect(external).toEqual(["web", "mail", "t"]);
  expect(links.every((a) => !a.hasAttribute("target"))).toBe(true);
  expect(links[0].rel).toBe("noopener noreferrer");
  expect(links.map((a) => a.getAttribute("href"))).toEqual([
    "https://example.com",
    "mailto:a@b.c",
    "other.md",
    "#a",
    "https://x",
    null,
    null,
  ]);
});

test("test_sanitize_task_checkbox_kept_disabled", () => {
  const el = document.createElement("div");
  el.innerHTML = sanitize('<ul><li><input type="checkbox" checked> done</li></ul>');
  const box = el.querySelector("input");
  expect([box?.type, box?.checked, box?.disabled]).toEqual(["checkbox", true, true]);
});

test("test_csp_blocks_document_script", () => {
  const csp: string = JSON.parse(tauriConf).app.security.csp;
  const directives = new Map(
    csp.split(";").map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );
  expect(directives.get("default-src")).toEqual(["'self'"]);
  expect(directives.get("script-src")).toEqual(["'self'"]);
  expect(directives.get("object-src")).toEqual(["'none'"]);
  expect(directives.get("frame-src")).toEqual(["'none'"]);
});
