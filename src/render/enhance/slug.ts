/** Prefix on every id a document carries, as GitHub does, so a document's ids cannot clash
 * with the app's own or clobber `window` globals. */
export const ID_PREFIX = "user-content-";

// github-slugger's rule: drop everything but letters, marks, digits, connector punctuation,
// hyphens and spaces.
const STRIP = /[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu;

/** GitHub's heading slugs: lower-cased, punctuation dropped, spaces to hyphens, and a repeat
 * gets `-1`, `-2`, … in document order. */
export class Slugger {
  private seen = new Set<string>();

  slug(text: string): string {
    const base = text.trim().toLowerCase().replace(STRIP, "").replace(/ /g, "-") || "section";
    let slug = base;
    for (let n = 1; this.seen.has(slug); n++) slug = `${base}-${n}`;
    this.seen.add(slug);
    return slug;
  }
}
