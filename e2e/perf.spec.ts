import { expect, type Page, test } from "@playwright/test";
import type { Timing } from "./harness";

const KB = 1024;
const RUNS = 3;
// A freeze the reader would notice (specification: render_ms_1MB).
const LONG_TASK_MS = 200;
// The most diagrams the specification allows in the 1 MB document.
const DIAGRAMS = 20;

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
    totalMs: median("totalMs"),
    settledMs: median("settledMs"),
    longestTaskMs: median("longestTaskMs"),
  };
}

function report(name: string, t: Timing): void {
  const ms = (n: number) => Math.round(n);
  console.log(
    `${name}=${ms(t.totalMs)} settled_ms=${ms(t.settledMs)} longest_task_ms=${ms(t.longestTaskMs)}`,
  );
}

// "Fully rendered" (specification: render_ms_1MB): every block inserted, highlighted and
// typeset, and every Mermaid diagram drawn, then painted. Off-screen parts of a large
// document are laid out afterwards, in the background (`settledMs`, reported, not bounded);
// the no-freeze bound covers that phase too.
test("test_render_1mb_within_budget_no_long_tasks", async ({ page }, info) => {
  const timing = await measure(page, KB * KB, DIAGRAMS);
  report(`[${info.project.name}] render_ms_1MB`, timing);
  // render_ms_1MB <= 1500, all Mermaid included (at most 20 diagrams)
  expect.soft(timing.totalMs).toBeLessThanOrEqual(1500);
  expect.soft(timing.longestTaskMs).toBeLessThanOrEqual(LONG_TASK_MS);

  // All of it is there, highlighted, typeset and drawn, laid out without the pieces' boxes.
  const doc = page.locator("#doc");
  const sections = await page.evaluate(
    (d) => window.harness.big(1024 * 1024, d).split("\n## ").length - 1,
    DIAGRAMS,
  );
  await expect(doc.locator("h2")).toHaveCount(sections);
  await expect(doc.locator(".mermaid > svg")).toHaveCount(DIAGRAMS);
  await expect(doc.locator(".chunk")).toHaveCount(0);
  await expect(doc.locator(".code-block code:not(.hljs)")).toHaveCount(0);
  await expect(doc.locator(".math:not(:has(.katex))")).toHaveCount(0);
  await expect(doc.locator("section.footnotes li")).toHaveCount(Math.floor(sections / 2));
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

  // Count the diagrams that land in each animation frame.
  await page.goto("/e2e/harness.html");
  const perFrame = await page.evaluate(async () => {
    let frame = 0;
    let running = true;
    const tick = () => {
      frame++;
      if (running) requestAnimationFrame(tick);
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
    await window.harness.show(window.harness.big(10 * 1024, 20));
    running = false;
    observer.disconnect();
    return frames;
  });
  expect(perFrame).toHaveLength(20);
  expect(new Set(perFrame).size).toBe(20);
  await expect(page.locator("#doc .mermaid > svg")).toHaveCount(20);
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
