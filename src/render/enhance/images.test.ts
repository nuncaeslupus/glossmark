import { describe, expect, it } from "vitest";
import { render } from "../pipeline";
import { sanitize } from "../sanitize";
import { imagePolicy, resolveLocal } from "./images";

const DOC = "/home/u/notes/readme.md";
const asset = (p: string) => `asset://localhost/${encodeURIComponent(p)}`;

function images(markdown: string, remoteImages: boolean): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = sanitize(render(markdown), imagePolicy(DOC, remoteImages, asset));
  return root;
}

const REMOTE = [
  "![a](https://example.com/a.png)",
  "![b](//example.com/b.png)",
  '<img src="http://example.com/c.png" srcset="https://example.com/c2.png 2x">',
  '<picture><source srcset="https://example.com/d.png"><img src="data:image/png;base64,AA=="></picture>',
].join("\n\n");

describe("imagePolicy", () => {
  it("test_remote_images_off_sources_removed_before_insertion", () => {
    const root = images(REMOTE, false);
    expect(root.innerHTML).not.toMatch(/ (?:src|srcset)="[^"]*example\.com/);
    expect(root.querySelector("img")?.getAttribute("data-remote-src")).toBe(
      "https://example.com/a.png",
    );
    expect(root.querySelector('img[src^="data:"]')).not.toBeNull();
  });

  it("test_remote_images_on_sources_kept", () => {
    const root = images(REMOTE, true);
    const srcs = Array.from(root.querySelectorAll("img"), (i) => i.getAttribute("src"));
    expect(srcs).toContain("https://example.com/a.png");
    expect(srcs).toContain("https://example.com/b.png");
    expect(root.querySelector("source")?.getAttribute("srcset")).toBe("https://example.com/d.png");
  });

  it("test_local_images_use_asset_protocol_and_svgs_marked", () => {
    const root = images("![x](img/my%20pic.png) ![y](../flow.SVG) ![z](/abs/z.png)", true);
    const [x, y, z] = Array.from(root.querySelectorAll("img"));
    expect(x.getAttribute("src")).toBe(asset("/home/u/notes/img/my pic.png"));
    expect(y.getAttribute("src")).toBeNull();
    expect(y.getAttribute("data-svg-path")).toBe("/home/u/flow.SVG");
    expect(z.getAttribute("src")).toBe(asset("/abs/z.png"));
  });

  it("test_resolve_local_handles_spaces_and_fragments", () => {
    expect(resolveLocal("/a b/doc.md", "c%20d.png?x#y")).toBe("/a b/c d.png");
    expect(resolveLocal("/a/doc.md", "%E0%A4%A")).toBeNull();
  });
});
