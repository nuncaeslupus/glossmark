/** The scrolling box `el` is in: an ancestor that scrolls, else the page's. */
export function scroller(el: Element): Element {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p;
  }
  return document.scrollingElement ?? document.documentElement;
}
