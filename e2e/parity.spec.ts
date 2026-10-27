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
