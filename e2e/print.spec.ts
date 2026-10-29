import { expect, type Page, test } from "@playwright/test";

// `emulateMedia({ media: "print" })` and computed styles, so WebKit (the app's engine) checks
// the print stylesheet too: Playwright's `page.pdf()` is Chromium-only.

/** Opens the fixture and scrolls its diagram near the view, so it is drawn. With `far`, a
 * second diagram far below is never scrolled to. */
async function open(page: Page, theme: "light" | "dark", far = false) {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto(`/e2e/theme.html?theme=${theme}${far ? "&far" : ""}`);
  await page.locator(".sheet :is(pre.mermaid-pending, .mermaid)").first().scrollIntoViewIfNeeded();
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
  for (const selector of [".bar", ".titlebar", ".outline", ".find"]) {
    expect(await display(page, selector), `${selector} on screen`).not.toBe("none");
  }
  // A zoomed diagram prints unzoomed, without its view controls.
  await page.locator(".sheet .mermaid-controls > button").first().click();
  await page.emulateMedia({ media: "print" });
  const svg = page.locator(".sheet .mermaid > svg");
  expect(await svg.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  for (const selector of [
    ".bar",
    ".titlebar",
    ".outline",
    ".find",
    ".sheet .code-block > .copy",
    ".sheet .mermaid-controls",
  ]) {
    expect(await display(page, selector), `${selector} in print`).toBe("none");
  }
  // The sheet alone, without the grey canvas, its margins or its shadow.
  await expect(page.locator("article.sheet")).toBeVisible();
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

test("print keeps headings with their text", async ({ page }) => {
  // WebKit ignores `break-after`, so the fix is a reserved band below each heading, inside
  // `break-inside: avoid`. Playwright cannot paginate WebKit (page.pdf is Chromium-only), so
  // assert the mechanism is in place; the owner judges the exported PDF in the PR.
  await open(page, "light");
  await page.emulateMedia({ media: "print" });
  const seen = await page.evaluate(() => {
    const h2 = document.querySelector(".sheet h2") as Element;
    const after = getComputedStyle(h2, "::after");
    const row = document.querySelector(".sheet tr");
    return {
      display: after.display,
      height: Number.parseFloat(after.height),
      marginBottom: Number.parseFloat(after.marginBottom),
      headingBreakInside: getComputedStyle(h2).breakInside,
      row: row && getComputedStyle(row).breakInside,
    };
  });
  expect(seen.display).toBe("block");
  expect(seen.height).toBeGreaterThan(0);
  // The band is pulled back by a matching negative margin, so it adds no visible gap.
  expect(seen.marginBottom).toBeCloseTo(-seen.height, 0);
  expect(seen.headingBreakInside).toBe("avoid");
  expect(seen.row).toBe("avoid");
});

test("test_print_draws_diagrams_light", async ({ page }) => {
  // The stub records the diagram's fill at the moment print() runs.
  // The stub records every diagram's fill, and the fences still waiting, when print() runs.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number; printedFills: string[]; left: number };
    w.printed = 0;
    window.print = () => {
      w.printed++;
      w.printedFills = [...document.querySelectorAll(".sheet .mermaid > svg")].map((svg) => {
        const el = svg.querySelector(".node :is(rect, polygon)");
        return el ? getComputedStyle(el).fill : "";
      });
      w.left = document.querySelectorAll(".sheet pre.mermaid-pending").length;
    };
  });
  await open(page, "light");
  const node = page.locator(".sheet .mermaid > svg .node :is(rect, polygon)").first();
  const fill = () => node.evaluate((el) => getComputedStyle(el).fill);
  const light = await fill();
  await open(page, "dark", true);
  const dark = await fill();
  expect(dark).not.toBe(light);
  await expect(page.locator(".sheet pre.mermaid-pending")).toHaveCount(1);

  await page.locator(".bar-button[data-action=print]").click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed))
    .toBe(1);
  const printed = await page.evaluate(() => {
    const w = window as unknown as { printedFills: string[]; left: number };
    return { fills: w.printedFills, left: w.left };
  });
  // Both drawn light, the one never scrolled to included.
  expect(printed, "drawn light when print() runs").toEqual({ fills: [light, light], left: 0 });
  // Restored once print() returns, even without `afterprint`.
  await expect.poll(fill).toBe(dark);
});
