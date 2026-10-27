import { expect, test } from "@playwright/test";
import { strings } from "../src/strings";

test("test_find_cycles_matches_forward_and_back", async ({ page }) => {
  await page.goto("/e2e/shell.html");
  await expect(page.locator(".sheet h1")).toBeVisible();

  // Find opens a box under the bar, not a dialog, and takes the focus.
  await page.locator(".bar-button[data-action=find]").click();
  const input = page.locator(".find-input");
  await expect(input).toBeFocused();
  await input.fill("needle");

  const marks = page.locator(".sheet mark.find-match");
  await expect(marks).toHaveCount(3);
  const at = async (n: number) => {
    await expect(page.locator(".find-count")).toHaveText(strings.findCount(n, 3));
    await expect(page.locator(".sheet mark.current")).toHaveCount(1);
    await expect(marks.nth(n - 1)).toHaveClass(/current/);
    await expect(marks.nth(n - 1)).toBeInViewport();
  };
  await at(1);

  // Enter goes forward and wraps; Shift+Enter goes back and wraps.
  for (const n of [2, 3, 1]) {
    await input.press("Enter");
    await at(n);
  }
  for (const n of [3, 2]) {
    await input.press("Shift+Enter");
    await at(n);
  }
  await expect(marks.nth(0)).not.toBeInViewport();

  await input.press("Escape");
  await expect(page.locator(".find")).toBeHidden();
  await expect(marks).toHaveCount(0);
  await expect(page.locator("dialog")).toHaveCount(0);
});
