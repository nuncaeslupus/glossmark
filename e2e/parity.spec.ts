import { expect, test } from "@playwright/test";

test("heading anchor shows when its own spot is hovered", async ({ page }) => {
  await page.goto("/e2e/shell.html");
  const anchor = page.locator(".sheet h1 > .anchor");
  await expect(anchor).toHaveCSS("opacity", "0");

  // GitHub's chain icon, not a "#".
  const icon = await anchor.evaluate((a) => {
    const s = getComputedStyle(a, "::before");
    return { content: s.content, mask: s.maskImage || s.webkitMaskImage };
  });
  expect(icon.content).not.toContain("#");
  expect(icon.mask).toContain("svg");

  // Hovering the icon's own spot, left of the heading text, shows it.
  const box = await anchor.boundingBox();
  if (!box) throw new Error("anchor has no box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(anchor).toHaveCSS("opacity", "1");
});

test("img height attribute sizes the image", async ({ page }) => {
  // A 600×300 picture with only height="150", like the mermaid-js README logo, in a sheet
  // styled as the app is.
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='300'/>";
  await page.goto("/e2e/theme.html");
  const sheet = page.locator(".sheet").first();
  await sheet.evaluate(
    (el, src) => {
      el.insertAdjacentHTML("afterbegin", `<img alt="logo" height="150" src="${src}">`);
    },
    `data:image/svg+xml,${encodeURIComponent(svg)}`,
  );
  const img = page.locator(".sheet img[alt=logo]");
  await expect(img).toHaveJSProperty("complete", true);
  const box = await img.boundingBox();
  expect(box?.height).toBe(150);
  expect(box?.width).toBe(300);

  // Both attributes, wider than the sheet: scaled down whole, not squashed.
  await sheet.evaluate(
    (el, src) => {
      el.insertAdjacentHTML(
        "afterbegin",
        `<img alt="wide" width="4000" height="2000" src="${src}">`,
      );
    },
    `data:image/svg+xml,${encodeURIComponent(svg)}`,
  );
  const wide = await page.locator(".sheet img[alt=wide]").boundingBox();
  expect(wide?.width).toBeLessThan(4000);
  expect(wide?.height).toBeCloseTo((wide?.width ?? 0) / 2, 0);
});

test("gantt chart keeps its natural height", async ({ page }) => {
  // Mermaid lays a Gantt chart out at its container's width: laid out wider than the sheet,
  // it is then shrunk to fit, and its bars squashed.
  await page.goto("/e2e/theme.html?gantt");
  const svg = page.locator(".sheet .mermaid > svg[aria-roledescription=gantt]");
  await expect(svg).toHaveCount(1);
  const { drawn, natural } = await svg.evaluate((el) => ({
    drawn: el.getBoundingClientRect().width,
    natural: (el as SVGSVGElement).viewBox.baseVal.width,
  }));
  expect(drawn / natural).toBeGreaterThan(0.95);

  // Redrawn for a new theme while its tab is hidden, it keeps its width.
  const id = await svg.getAttribute("id");
  await page.evaluate(() => {
    (document.querySelector(".canvas") as HTMLElement).hidden = true;
    document.documentElement.dataset.theme = "dark";
  });
  await expect(svg).not.toHaveAttribute("id", id ?? "");
  expect(await svg.evaluate((el) => (el as SVGSVGElement).viewBox.baseVal.width)).toBe(natural);
});

test("body text is sans-serif", async ({ page }) => {
  // The owner's call: body text in the headings' sans (Inter), as on GitHub.
  await page.goto("/e2e/theme.html");
  const p = page.locator(".sheet p").first();
  await expect(p).toHaveCSS("font-family", /^"?Inter Variable/);
});

test("issues image matches GitHub size", async ({ page }) => {
  // The Mermaid README's "Git Issues" chart: GitHub lays it out across the column, unshrunk.
  await page.goto("/e2e/theme.html?issues");
  const svg = page.locator(".sheet .mermaid > svg[aria-roledescription=gantt]");
  await expect(svg).toHaveCount(1);
  const { drawn, natural, column } = await svg.evaluate((el) => ({
    drawn: el.getBoundingClientRect().width,
    natural: (el as SVGSVGElement).viewBox.baseVal.width,
    column: (el.parentElement as HTMLElement).clientWidth,
  }));
  expect(drawn / column).toBeGreaterThan(0.95);
  expect(drawn / natural).toBeGreaterThan(0.95);
});

test("copy button is always visible with the copy icon", async ({ page }) => {
  // GitHub's two-squares icon, shown without hovering the block, and no text label.
  await page.goto("/e2e/theme.html");
  const copy = page.locator(".sheet .code-block > .copy").first();
  await expect(copy).toHaveCSS("opacity", "1");
  const icon = await copy.evaluate((b) => {
    const s = getComputedStyle(b, "::before");
    return { content: s.content, mask: s.maskImage || s.webkitMaskImage };
  });
  expect(icon.content).not.toContain("Copy");
  // The Octicons "copy" path, not a check or a text label.
  expect(icon.mask).toContain("M0 6.75");
});
