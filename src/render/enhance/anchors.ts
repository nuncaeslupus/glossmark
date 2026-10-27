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
  const anchors = new Anchors();
  anchors.add(root);
  anchors.link(root);
  return anchors.outline;
}

/** `addAnchors` for a document inserted in pieces: `add` each piece in document order, then
 * `link` the whole once every piece is in. */
export class Anchors {
  readonly outline: Heading[] = [];
  private readonly slugger = new Slugger();

  add(part: ParentNode): void {
    for (const el of part.querySelectorAll("[id], [name]")) {
      for (const attr of ["id", "name"]) {
        const value = el.getAttribute(attr);
        if (value && !value.startsWith(ID_PREFIX)) el.setAttribute(attr, ID_PREFIX + value);
      }
    }
    for (const h of part.querySelectorAll<HTMLHeadingElement>(HEADINGS)) {
      const text = (h.textContent ?? "").trim();
      // A raw-HTML heading keeps its own (prefixed) id.
      if (!h.id) h.id = ID_PREFIX + this.slugger.slug(text);
      const anchor = document.createElement("a");
      anchor.className = "anchor";
      anchor.href = `#${h.id}`;
      anchor.setAttribute("aria-label", strings.headingLink(text));
      h.prepend(anchor);
      this.outline.push({ level: Number(h.tagName[1]), text, id: h.id });
    }
  }

  link(root: ParentNode): void {
    const ids = new Set([...root.querySelectorAll("[id]")].map((el) => el.id));
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const fragment = decode(a.getAttribute("href")?.slice(1) ?? "");
      if (!fragment.startsWith(ID_PREFIX) && ids.has(ID_PREFIX + fragment)) {
        a.setAttribute("href", `#${ID_PREFIX}${encodeURIComponent(fragment)}`);
      }
    }
  }
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
