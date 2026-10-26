import { describe, expect, it } from "vitest";
import { boot } from "./main";
import { strings } from "./strings";

describe("boot", () => {
  it("test_app_boot_with_no_file_shows_empty_state", () => {
    const root = document.createElement("div");
    boot(root, []);
    expect(root.querySelector("main.empty")?.textContent).toBe(strings.emptyState);
  });
});
