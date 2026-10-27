const FENCES = "pre > code.language-mermaid";
const DRAWN = ".mermaid[data-source]";
// A Mermaid fence in Markdown source, found before it is parsed.
const SOURCE_FENCE = /^ {0,3}(?:`{3,}|~{3,})\s*mermaid\b/m;

type Mermaid = typeof import("mermaid")["default"];

let count = 0;
let mermaid: Mermaid | null = null;
let loading: Promise<Mermaid> | null = null;
let drawnDark = false;
/** Set while printing: paper is light whatever the screen's theme. */
let forPaper = false;
// One draw at a time: `initialize` sets the theme for every `render` after it.
let queue: Promise<void> = Promise.resolve();

const nextFrame = () =>
  new Promise<void>((resolve) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(() => resolve())
      : setTimeout(resolve, 0),
  );

/** Whether the page is dark now: the theme sets `color-scheme` on the root. */
function dark(): boolean {
  return !forPaper && /dark/.test(getComputedStyle(document.documentElement).colorScheme);
}

function enqueue(work: () => Promise<void>): Promise<void> {
  queue = queue.then(work, work);
  return queue;
}

function load(): Promise<Mermaid> {
  loading ??= import("mermaid").then(({ default: loaded }) => {
    mermaid = loaded;
    followTheme();
    return loaded;
  });
  return loading;
}

/** Start loading Mermaid if `source` has a diagram, while the UI thread waits on the parse. */
export function preloadMermaid(source: string): void {
  if (SOURCE_FENCE.test(source)) load().catch(() => {});
}

/** Draws each item in turn, one per frame, so a document with many never freezes the window.
 * Mermaid measures its drawing in the page: on a stage of its own, with layout contained,
 * that never lays out the document again. */
async function drawEach<T>(items: T[], each: (item: T, stage: HTMLElement) => Promise<void>) {
  const stage = document.createElement("div");
  stage.className = "mermaid-stage";
  document.body.append(stage);
  try {
    for (const [i, item] of items.entries()) {
      if (i > 0) await nextFrame();
      await each(item, stage);
    }
  } finally {
    stage.remove();
  }
}

/** Draws `source` with the page's current theme; throws when it does not parse. */
async function draw(m: Mermaid, source: string, stage: HTMLElement): Promise<string> {
  const id = `glossmark-mermaid-${++count}`;
  try {
    return (await m.render(id, source, stage)).svg;
  } catch (error) {
    // A failed draw can leave Mermaid's temporary element behind.
    stage.replaceChildren();
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

/** Redraws every diagram if the page turned light or dark since: Mermaid bakes its colours in. */
function redraw(): Promise<void> {
  if (!mermaid || dark() === drawnDark) return queue;
  const m = mermaid;
  return enqueue(async () => {
    initialize(m);
    const figures = [...document.querySelectorAll<HTMLElement>(DRAWN)];
    await drawEach(figures, async (figure, stage) => {
      try {
        figure.innerHTML = await draw(m, figure.dataset.source ?? "", stage);
        figure.classList.remove("mermaid-error");
      } catch (error) {
        // The old drawing stays, in the other theme, so it is marked as a first draw's would be.
        figure.classList.add("mermaid-error");
        figure.title = String(error);
        console.error(error);
      }
    });
  });
}

function followTheme(): void {
  new MutationObserver(() => void redraw()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => void redraw());
}

/** Redraws the diagrams light for paper; the returned function puts the screen theme back.
 * Mermaid draws asynchronously, so this is awaited before `print()`: `beforeprint` cannot
 * wait. `afterprint` restores too, for a webview whose `print()` does not block. */
export async function diagramsForPaper(): Promise<() => void> {
  forPaper = true;
  const back = () => {
    if (!forPaper) return;
    forPaper = false;
    void redraw();
  };
  addEventListener("afterprint", back, { once: true });
  await redraw();
  return back;
}

/** Replace each `mermaid` fence with its diagram, in the page's light or dark theme. Mermaid
 * (~2 MB) is imported only when the document has one. Its SVG is inserted after sanitising:
 * trusted code drew it, with `securityLevel: 'strict'` so labels cannot carry HTML or script.
 * A diagram that fails to parse stays as its source. */
export async function renderMermaid(root: ParentNode): Promise<void> {
  const fences = [...root.querySelectorAll<HTMLElement>(FENCES)];
  if (fences.length === 0) return;
  const m = await load();
  return enqueue(async () => {
    initialize(m);
    await drawEach(fences, async (code, stage) => {
      const pre = code.parentElement;
      if (!pre) return;
      const source = code.textContent ?? "";
      try {
        const svg = await draw(m, source, stage);
        const figure = document.createElement("div");
        figure.className = "mermaid";
        figure.dataset.source = source;
        figure.innerHTML = svg;
        pre.replaceWith(figure);
      } catch (error) {
        pre.classList.add("mermaid-error");
        pre.title = String(error);
      }
    });
  });
}
