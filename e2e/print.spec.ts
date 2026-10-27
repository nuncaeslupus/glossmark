import { expect, type Page, test } from "@playwright/test";

// `emulateMedia({ media: "print" })` and computed styles, so WebKit (the app's engine) checks
// the print stylesheet too: Playwright's `page.pdf()` is Chromium-only.

async function open(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`/e2e/theme.html?theme=${theme}`);
  await expect(page.locator(".sheet .mermaid > svg")).toHaveCount(1);
}

const display = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).display);

test("test_print_media_hides_app_controls", async ({ page }) => {
  await open(page, "light");
  await page.locator(".bar-button[data-action=outline]").click();
  await page.locator(".bar-button[data-action=find]").click();
  for (const selector of [".bar", ".tabs", ".outline", ".find"]) {
    expect(await display(page, selector), `${selector} on screen`).not.toBe("none");
  }
  await page.emulateMedia({ media: "print" });
  for (const selector of [".bar", ".tabs", ".outline", ".find", ".sheet .code-block > .copy"]) {
    expect(await display(page, selector), `${selector} in print`).toBe("none");
  }
  // The sheet alone, without the grey canvas, its margins or its shadow.
  await expect(page.locator(".sheet")).toBeVisible();
  const sheet = await page.evaluate(() => {
    const style = (selector: string) =>
      getComputedStyle(document.querySelector(selector) as Element);
    return {
      body: style("body").backgroundColor,
      shadow: style(".sheet").boxShadow,
      padding: style(".sheet").paddingLeft,
    };
  });
  expect(sheet).toEqual({ body: "rgba(0, 0, 0, 0)", shadow: "none", padding: "0px" });
});

test("test_print_paper_is_light_in_dark_theme", async ({ page }) => {
  await open(page, "light");
  const colours = () =>
    page.evaluate(() => {
      const style = (selector: string) =>
        getComputedStyle(document.querySelector(selector) as Element);
      return { ink: style(".sheet p").color, code: style(".sheet pre").backgroundColor };
    });
  const light = await colours();
  await open(page, "dark");
  expect(await colours()).not.toEqual(light);
  await page.emulateMedia({ media: "print" });
  expect(await colours()).toEqual(light);
});

test("test_print_keeps_blocks_whole", async ({ page }) => {
  await open(page, "light");
  await page.emulateMedia({ media: "print" });
  const seen = await page.evaluate(() => {
    const style = (selector: string) => {
      const el = document.querySelector(selector);
      return el && getComputedStyle(el);
    };
    const blocks = [".sheet pre", ".sheet table", ".sheet .math-display", ".sheet .mermaid"];
    return {
      inside: Object.fromEntries(blocks.map((s) => [s, style(s)?.breakInside ?? null])),
      heading: style(".sheet h2")?.breakAfter,
      wrap: style(".sheet pre")?.whiteSpace,
    };
  });
  for (const [selector, value] of Object.entries(seen.inside)) {
    expect(value, `${selector}`).toBe("avoid");
  }
  expect(seen.heading).toBe("avoid");
  expect(seen.wrap).toBe("pre-wrap");
});

test("test_print_draws_diagrams_light", async ({ page }) => {
  // The stub records the diagram's fill at the moment print() runs.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number; printedFill: string };
    w.printed = 0;
    window.print = () => {
      w.printed++;
      const el = document.querySelector(".sheet .mermaid > svg .node :is(rect, polygon)");
      w.printedFill = el ? getComputedStyle(el).fill : "";
    };
  });
  await open(page, "light");
  const node = page.locator(".sheet .mermaid > svg .node :is(rect, polygon)").first();
  const fill = () => node.evaluate((el) => getComputedStyle(el).fill);
  const light = await fill();
  await open(page, "dark");
  const dark = await fill();
  expect(dark).not.toBe(light);

  await page.locator(".bar-button[data-action=print]").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
    .toBe(1);
  const printedFill = await page.evaluate(
    () => (window as unknown as { printedFill: string }).printedFill,
  );
  expect(printedFill, "drawn light when print() runs").toBe(light);
  // Restored once print() returns, even without `afterprint`.
  await expect.poll(fill).toBe(dark);
});
