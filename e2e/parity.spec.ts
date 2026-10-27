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
