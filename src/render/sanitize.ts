import DOMPurify from "dompurify";
import type { ImagePolicy } from "./enhance/images";

// GitHub's safe-HTML allowlist (D-15), after html-pipeline's SanitizationFilter. `section` and
// `input` carry footnotes and task-list checkboxes; `class`/`id` carry language tags, alerts
// and anchors. No `style`: GitHub strips it too.
// biome-ignore format: a dense list reads better than one entry per line
const TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6", "br", "b", "i", "strong", "em", "a", "pre", "code",
  "img", "tt", "div", "ins", "del", "sup", "sub", "p", "ol", "ul", "table", "thead", "tbody",
  "tfoot", "blockquote", "dl", "dt", "dd", "kbd", "q", "samp", "var", "hr", "ruby", "rt", "rp",
  "li", "tr", "td", "th", "s", "strike", "summary", "details", "caption", "figure",
  "figcaption", "abbr", "bdo", "cite", "dfn", "mark", "small", "span", "time", "wbr",
  "picture", "source", "section", "input",
];

// biome-ignore format: a dense list reads better than one entry per line
const ATTRS = [
  "href", "src", "srcset", "alt", "title", "id", "class", "name", "lang", "dir", "align",
  "valign", "width", "height", "colspan", "rowspan", "scope", "headers", "start", "type",
  "reversed", "open", "datetime", "cite", "checked", "disabled", "media", "abbr", "span",
];

// Absolute URLs only as http(s)/mailto; relative paths and #fragments pass. DOMPurify's own
// pattern minus its other schemes. DOMPurify still lets `data:` through on <img> (inert; CSP
// `img-src` allows it), never on links.
const URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;
const EXTERNAL = /^(?:https?|mailto):/i;
// `//host` (or `\\host`) passes URI as relative but leaves the document: dropped.
const PROTOCOL_RELATIVE = /^\s*[\\/]{2}/;

const purify = DOMPurify(window);
let images: ImagePolicy | undefined;

// Links: external ones are flagged for the shell to hand to the OS and never open in the
// webview; in-document and relative links stay for in-app navigation.
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node instanceof HTMLAnchorElement) {
    const href = node.getAttribute("href");
    if (href && PROTOCOL_RELATIVE.test(href)) node.removeAttribute("href");
    else if (href && EXTERNAL.test(href)) {
      node.setAttribute("data-external", "");
      node.setAttribute("rel", "noopener noreferrer");
    }
  } else if (node instanceof HTMLImageElement || node instanceof HTMLSourceElement) {
    images?.(node);
  } else if (node instanceof HTMLInputElement) {
    if (node.type !== "checkbox") node.remove();
    else node.setAttribute("disabled", "");
  }
});

/** Strip everything outside the allowlist from rendered HTML; `policy` rewrites image sources. */
export function sanitize(html: string, policy?: ImagePolicy): string {
  images = policy;
  try {
    return purify.sanitize(html, {
      ALLOWED_TAGS: TAGS,
      ALLOWED_ATTR: ATTRS,
      ALLOWED_URI_REGEXP: URI,
      ALLOW_DATA_ATTR: false,
    });
  } finally {
    images = undefined;
  }
}
