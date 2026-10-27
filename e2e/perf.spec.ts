import { expect, type Page, test } from "@playwright/test";
import type { Timing } from "./harness";

const KB = 1024;
const RUNS = 3;
// A freeze the reader would notice (specification: render_ms_1MB).
const LONG_TASK_MS = 200;
// The most diagrams the specification allows in the 1 MB document.
const DIAGRAMS = 20;

// Three 1 MB renders take longer than the default 30 s on a slow runner (WebKit on CI).
test.describe.configure({ timeout: 120_000 });

/** Render a generated document in a fresh page, `RUNS` times; the median of each timing,
 * so one slow run on a busy machine does not decide. */
async function measure(page: Page, bytes: number, diagrams = 0): Promise<Timing> {
  const runs: Timing[] = [];
  for (let i = 0; i < RUNS; i++) {
    await page.goto("/e2e/harness.html");
    runs.push(
      await page.evaluate(([b, d]) => window.harness.measure(window.harness.big(b, d)), [
        bytes,
        diagrams,
      ] as const),
    );
  }
  const median = (key: keyof Timing) => runs.map((r) => r[key]).sort((a, b) => a - b)[RUNS >> 1];
  return {
    interactiveMs: median("interactiveMs"),
    totalMs: median("totalMs"),
    settledMs: median("settledMs"),
    longestTaskMs: median("longestTaskMs"),
  };
}

function report(name: string, t: Timing): void {
  const ms = (n: number) => Math.round(n);
  console.log(
    `${name}=${ms(t.totalMs)} interactive_ms=${ms(t.interactiveMs)} settled_ms=${ms(t.settledMs)} longest_task_ms=${ms(t.longestTaskMs)}`,
  );
}

// Rendered and interactive (specification: render_ms_1MB): every block inserted, highlighted
// and typeset, the diagrams near the view drawn, then painted. The other diagrams are drawn as
// they come near the view; off-screen parts of a large document are laid out afterwards, in
// the background (`settledMs`, reported, not bounded). The no-freeze bound covers both.
test("test_render_1mb_within_budget_no_long_tasks", async ({ page }, info) => {
  const timing = await measure(page, KB * KB, DIAGRAMS);
  report(`[${info.project.name}] render_ms_1MB`, timing);
  // render_ms_1MB <= 1500, with up to 20 diagrams drawn as they approach the view
  expect.soft(timing.totalMs).toBeLessThanOrEqual(1500);
  expect.soft(timing.longestTaskMs).toBeLessThanOrEqual(LONG_TASK_MS);

  // All of it is there, highlighted and typeset, laid out without the pieces' boxes.
  const doc = page.locator("#doc");
  const sections = await page.evaluate(
    (d) => window.harness.big(1024 * 1024, d).split("\n## ").length - 1,
    DIAGRAMS,
  );
  await expect(doc.locator("h2")).toHaveCount(sections);
  await expect(doc.locator(".chunk")).toHaveCount(0);
  await expect(doc.locator(".code-block code:not(.hljs)")).toHaveCount(0);
  await expect(doc.locator(".math:not(:has(.katex))")).toHaveCount(0);
  await expect(doc.locator("section.footnotes li")).toHaveCount(Math.floor(sections / 2));
  // The diagram in the first view is drawn; the rest wait, far below, as their source.
  const diagrams = await page.evaluate(() => {
    const tops = (selector: string) =>
      [...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect().top);
    return {
      drawn: tops("#doc .mermaid"),
      pending: tops("#doc pre.mermaid-pending"),
      view: innerHeight,
    };
  });
  expect(diagrams.drawn.length).toBeGreaterThanOrEqual(1);
  expect(diagrams.drawn.length + diagrams.pending.length).toBe(DIAGRAMS);
  expect(Math.max(...diagrams.drawn)).toBeLessThan(2 * diagrams.view);
  expect(Math.min(...diagrams.pending)).toBeGreaterThan(2 * diagrams.view);
});

test("test_render_100kb_within_budget_no_long_tasks", async ({ page }, info) => {
  const timing = await measure(page, 100 * KB);
  report(`[${info.project.name}] render_ms_100KB`, timing);
  // The whole first paint gets 500 ms (first_paint_ms_100KB); rendering is part of it.
  expect(timing.totalMs).toBeLessThanOrEqual(500);
  expect(timing.longestTaskMs).toBeLessThanOrEqual(LONG_TASK_MS);
});

test("test_render_20_mermaid_one_per_frame_no_long_tasks", async ({ page }, info) => {
  const timing = await measure(page, 10 * KB, 20);
  report(`[${info.project.name}] render_ms_20_mermaid`, timing);
  expect(timing.longestTaskMs).toBeLessThanOrEqual(LONG_TASK_MS);

  // Scroll through, counting the diagrams that land in each animation frame and timing the
  // longest task while they are drawn.
  await page.goto("/e2e/harness.html");
  const seen = await page.evaluate(async () => {
    let frame = 0;
    let running = true;
    let last = performance.now();
    let longest = 0;
    const tick = () => {
      frame++;
      if (running) requestAnimationFrame(tick);
    };
    const beat = () => {
      const now = performance.now();
      longest = Math.max(longest, now - last);
      last = now;
      if (running) setTimeout(beat, 0);
    };
    requestAnimationFrame(tick);
    const frames: number[] = [];
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n instanceof Element && n.classList.contains("mermaid")) frames.push(frame);
        }
      }
    });
    observer.observe(document.getElementById("doc") as HTMLElement, {
      childList: true,
      subtree: true,
    });
    setTimeout(beat, 0);
    await window.harness.show(window.harness.big(10 * 1024, 20));
    const deadline = performance.now() + 30_000;
    while (frames.length < 20 && performance.now() < deadline) {
      scrollBy(0, innerHeight / 2);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    running = false;
    observer.disconnect();
    return { frames, longest };
  });
  console.log(
    `[${info.project.name}] longest_task_ms_scrolling_20_mermaid=${Math.round(seen.longest)}`,
  );
  expect(seen.frames).toHaveLength(20);
  expect(new Set(seen.frames).size).toBe(20);
  expect(seen.longest).toBeLessThanOrEqual(LONG_TASK_MS);
  await expect(page.locator("#doc .mermaid > svg")).toHaveCount(20);
});

test("test_mermaid_drawn_when_scrolled_into_view", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto("/e2e/harness.html");
  await page.evaluate(() => {
    const filler = Array.from({ length: 200 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");
    const fence = "```mermaid\ngraph LR\n  A --> B\n```\n";
    return window.harness.show(`# Top\n\n${filler}\n\n${fence}`);
  });
  // Far below the view: left as its source, and Mermaid not even loaded.
  const pending = page.locator("#doc pre.mermaid-pending > code.language-mermaid");
  await expect(pending).toHaveCount(1);
  await page.waitForTimeout(300);
  expect(requests.filter((url) => /mermaid/i.test(url))).toEqual([]);

  await pending.scrollIntoViewIfNeeded();
  await expect(page.locator("#doc .mermaid > svg")).toHaveCount(1);
  await expect(page.locator("#doc pre")).toHaveCount(0);
  expect(requests.some((url) => /mermaid/i.test(url))).toBe(true);
});

test("test_back_to_large_document_keeps_heading_at_top", async ({ page }) => {
  await page.goto("/e2e/shell.html?big");
  const sheet = page.locator(".canvas:not([hidden]) .sheet");
  await expect(sheet.locator("h2").first()).toBeAttached({ timeout: 10_000 });
  await expect(sheet.locator(".chunk")).toHaveCount(0, { timeout: 10_000 });

  // Put a heading far down at the top of the view, follow a link, and come back.
  const heading = sheet.locator("h2", { hasText: "Section 300:" });
  const offset = () =>
    heading.evaluate((h) => {
      const canvas = h.closest(".canvas") as HTMLElement;
      return h.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
    });
  await heading.evaluate((h) => h.scrollIntoView());
  const before = await offset();
  await sheet
    .locator("a", { hasText: "Other" })
    .first()
    .evaluate((a) => (a as HTMLElement).click());
  await expect(sheet.locator("h1", { hasText: "Other" })).toBeVisible();
  await page.keyboard.press("Alt+ArrowLeft");
  // The place is restored once the document is laid out in full, and then kept.
  await expect(heading).toBeAttached({ timeout: 10_000 });
  await expect(sheet.locator(".chunk")).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(async () => Math.abs((await offset()) - before)).toBeLessThan(10);
  await page.waitForTimeout(500);
  expect(Math.abs((await offset()) - before)).toBeLessThan(10);
});
