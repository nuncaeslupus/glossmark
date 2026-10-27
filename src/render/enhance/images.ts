/** Rewrites an `img` or `source` element while it is still in DOMPurify's inert document. */
export type ImagePolicy = (el: Element) => void;

// `//host/x.png` is remote too; the sanitiser's URI pattern lets it through as relative.
const REMOTE = /^\s*(?:https?:)?[\\/]{2}/i;
const SCHEME = /^\s*[a-z][a-z0-9+.-]*:/i;
const SVG = /\.svg$/i;

// Remote images off (D-12) is enforced here, before insertion, not after: an `<img>` created in
// the live document starts fetching at once, even detached, while DOMPurify's document is
// inert. So a remote URL never reaches a live element and no request is even attempted (a CSP
// block alone still starts one and cancels it). `blockRemoteImages` then narrows the CSP as a
// second lock for anything this misses. Both are checked in e2e/images.spec.ts.
/** Local paths go to the asset protocol (SVGs are marked for inlining); remote ones are kept or dropped. */
export function imagePolicy(
  docPath: string,
  remoteImages: boolean,
  toAssetUrl: (path: string) => string,
): ImagePolicy {
  return (el) => {
    const srcset = el.getAttribute("srcset");
    // ponytail: a local `srcset` is dropped, not rewritten; `src` still shows the image.
    if (srcset !== null && !(remoteImages && candidates(srcset).every((u) => REMOTE.test(u)))) {
      el.removeAttribute("srcset");
    }
    const src = el.getAttribute("src");
    if (src === null || el.tagName !== "IMG") return;
    if (REMOTE.test(src)) {
      el.removeAttribute("src");
      if (remoteImages) el.setAttribute("src", src.replace(/^\s*[\\/]{2}/, "https://"));
      else el.setAttribute("data-remote-src", src);
      return;
    }
    if (SCHEME.test(src)) return; // `data:`; other schemes never pass the sanitiser
    el.removeAttribute("src");
    const path = resolveLocal(docPath, src);
    if (path === null) return;
    if (SVG.test(path)) el.setAttribute("data-svg-path", path);
    else el.setAttribute("src", toAssetUrl(path));
  };
}

function candidates(srcset: string): string[] {
  return srcset
    .split(",")
    .map((c) => c.trim().split(/\s+/)[0])
    .filter(Boolean);
}

/** The absolute file path an image URL names, relative to the document's own path. */
export function resolveLocal(docPath: string, src: string): string | null {
  try {
    const base = new URL("file:///");
    base.pathname = docPath;
    return decodeURIComponent(new URL(src, base).pathname);
  } catch {
    return null;
  }
}

/** Narrows the page's CSP so no image can load from outside the app, whatever the markup. */
export function blockRemoteImages(doc: Document = document): void {
  if (doc.querySelector('meta[data-remote-images="off"]')) return;
  // Policies intersect, so this meta can only tighten the one from `tauri.conf.json`.
  // ponytail: it cannot be lifted again; turning the setting back on reloads the window.
  const meta = doc.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = "img-src 'self' asset: http://asset.localhost data:";
  meta.setAttribute("data-remote-images", "off");
  doc.head.append(meta);
}
