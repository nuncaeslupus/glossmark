import { expect, test } from "vitest";
import { render } from "../pipeline";
import { sanitize } from "../sanitize";
import { addAnchors } from "./anchors";
import { Slugger } from "./slug";

const insert = (source: string) => {
  const el = document.createElement("article");
  el.innerHTML = sanitize(render(source));
  return el;
};

test("test_slug_matches_github", () => {
  const s = new Slugger();
  expect(s.slug("Hello, World!")).toBe("hello-world");
  expect(s.slug("Hello World")).toBe("hello-world-1");
  expect(s.slug("Hello World")).toBe("hello-world-2");
  expect(s.slug("  C++ & Rust: a_b  ")).toBe("c--rust-a_b");
  expect(s.slug("Ünïcode 日本語")).toBe("ünïcode-日本語");
  expect(s.slug("Emoji 🎉 here")).toBe("emoji--here");
  expect(s.slug("!!!")).toBe("section");
  // A suffixed slug is taken too, so a later heading with that text moves on.
  expect(s.slug("hello-world-1")).toBe("hello-world-1-1");
});

test("test_anchors_prefix_ids_and_build_outline", () => {
  const el = insert(
    "# Title\n\n## Setup\n\nSee [setup](#setup), [missing](#nope) and a note.[^1]\n\n" +
      '## Setup\n\n<h3 id="raw">Raw</h3>\n\n<span name="n">x</span>\n\n[^1]: The note.',
  );
  const outline = addAnchors(el);
  expect(outline).toEqual([
    { level: 1, text: "Title", id: "user-content-title" },
    { level: 2, text: "Setup", id: "user-content-setup" },
    { level: 2, text: "Setup", id: "user-content-setup-1" },
    { level: 3, text: "Raw", id: "user-content-raw" },
  ]);
  const h2 = el.querySelector("h2");
  expect(h2?.firstElementChild?.matches("a.anchor[href='#user-content-setup']")).toBe(true);
  expect(h2?.textContent).toBe("Setup");
  expect(el.querySelector("span")?.getAttribute("name")).toBe("user-content-n");

  const hrefs = [...el.querySelectorAll("p a")].map((a) => a.getAttribute("href"));
  expect(hrefs.slice(0, 2)).toEqual(["#user-content-setup", "#nope"]);
  // Footnote links follow their prefixed targets.
  for (const a of el.querySelectorAll(".footnote-ref a, .footnote-backref")) {
    const href = a.getAttribute("href") ?? "";
    expect(href.startsWith("#user-content-fn"), href).toBe(true);
    expect(el.querySelector(`[id="${href.slice(1)}"]`), href).not.toBeNull();
  }
  expect([...el.querySelectorAll("[id]")].every((n) => n.id.startsWith("user-content-"))).toBe(
    true,
  );
});
