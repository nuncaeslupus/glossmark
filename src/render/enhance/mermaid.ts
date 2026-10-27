const FENCES = "pre > code.language-mermaid";
const DRAWN = ".mermaid[data-source]";

type Mermaid = typeof import("mermaid")["default"];

let count = 0;
let mermaid: Mermaid | null = null;
let loading: Promise<Mermaid> | null = null;
let drawnDark = false;
// One draw at a time: `initialize` sets the theme for every `render` after it.
let queue: Promise<void> = Promise.resolve();

/** Whether the page is dark now: the theme sets `color-scheme` on the root. */
function dark(): boolean {
  return /dark/.test(getComputedStyle(document.documentElement).colorScheme);
}

function enqueue(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work, work);
  return queue;
}

/** Draws `source` with the page's current theme; throws when it does not parse. */
async function draw(m: Mermaid, source: string): Promise<string> {
  const id = `glossmark-mermaid-${++count}`;
  try {
    return (await m.render(id, source)).svg;
  } catch (error) {
    // Mermaid draws in a temporary element on `body`; a failed draw can leave it behind.
    for (const tmp of [`d${id}`, id]) document.getElementById(tmp)?.remove();
    throw error;
  }
}

function initialize(m: Mermaid): void {
  drawnDark = dark();
  m.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: drawnDark ? "dark" : "default",
  });
}

/** Redraws every diagram when the page turns light or dark: Mermaid bakes its colours in. */
function followTheme(): void {
  const redraw = () => {
    if (!mermaid || dark() === drawnDark) return;
    const m = mermaid;
    void enqueue(async () => {
      initialize(m);
      for (const figure of document.querySelectorAll<HTMLElement>(DRAWN)) {
        try {
          figure.innerHTML = await draw(m, figure.dataset.source ?? "");
          figure.classList.remove("mermaid-error");
        } catch (error) {
          // The old drawing stays, in the other theme, so it is marked as a first draw's would be.
          figure.classList.add("mermaid-error");
          figure.title = String(error);
          console.error(error);
        }
      }
    });
  };
  new MutationObserver(redraw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
}

/** Replace each `mermaid` fence with its diagram, in the page's light or dark theme. Mermaid
 * (~2 MB) is imported only when the document has one. Its SVG is inserted after sanitising:
 * trusted code drew it, with `securityLevel: 'strict'` so labels cannot carry HTML or script.
 * A diagram that fails to parse stays as its source. */
export async function renderMermaid(root: ParentNode): Promise<void> {
  const fences = [...root.querySelectorAll<HTMLElement>(FENCES)];
  if (fences.length === 0) return;
  loading ??= import("mermaid").then(({ default: loaded }) => {
    mermaid = loaded;
    followTheme();
    return loaded;
  });
  const m = await loading;
  return enqueue(async () => {
    initialize(m);
    for (const code of fences) {
      const pre = code.parentElement;
      if (!pre) continue;
      const source = code.textContent ?? "";
      try {
        const svg = await draw(m, source);
        const figure = document.createElement("div");
        figure.className = "mermaid";
        figure.dataset.source = source;
        figure.innerHTML = svg;
        pre.replaceWith(figure);
      } catch (error) {
        pre.classList.add("mermaid-error");
        pre.title = String(error);
      }
    }
  });
}
