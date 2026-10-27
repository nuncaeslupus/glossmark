import { strings } from "../../strings";
import { ID_PREFIX, Slugger } from "./slug";

export interface Heading {
  level: number;
  text: string;
  id: string;
}

const HEADINGS = "h1, h2, h3, h4, h5, h6";

/** Prefix every document id and name, give each heading a GitHub slug id and an anchor link,
 * and point in-document `#fragment` links at the prefixed target, so footnotes and links
 * like `[see](#setup)` keep working. Returns the outline. */
export function addAnchors(root: ParentNode): Heading[] {
  for (const el of root.querySelectorAll("[id], [name]")) {
    for (const attr of ["id", "name"]) {
      const value = el.getAttribute(attr);
      if (value && !value.startsWith(ID_PREFIX)) el.setAttribute(attr, ID_PREFIX + value);
    }
  }

  const slugger = new Slugger();
  const outline: Heading[] = [];
  for (const h of root.querySelectorAll<HTMLHeadingElement>(HEADINGS)) {
    const text = (h.textContent ?? "").trim();
    // A raw-HTML heading keeps its own (prefixed) id.
    if (!h.id) h.id = ID_PREFIX + slugger.slug(text);
    const anchor = document.createElement("a");
    anchor.className = "anchor";
    anchor.href = `#${h.id}`;
    anchor.setAttribute("aria-label", strings.headingLink(text));
    h.prepend(anchor);
    outline.push({ level: Number(h.tagName[1]), text, id: h.id });
  }

  const ids = new Set([...root.querySelectorAll("[id]")].map((el) => el.id));
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    const fragment = decode(a.getAttribute("href")?.slice(1) ?? "");
    if (!fragment.startsWith(ID_PREFIX) && ids.has(ID_PREFIX + fragment)) {
      a.setAttribute("href", `#${ID_PREFIX}${encodeURIComponent(fragment)}`);
    }
  }
  return outline;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
