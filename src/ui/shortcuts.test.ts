import { afterEach, describe, expect, it } from "vitest";
import { actions } from "./definition";
import { fakeBackend } from "./fake-backend";
import { Shell } from "./shell";

let shell: Shell | undefined;
afterEach(() => shell?.dispose());

describe("keyboard shortcuts", () => {
  it("test_every_bar_action_has_shortcut", async () => {
    const { backend } = fakeBackend({ "/n/a.md": "# A" }, ["/n/a.md"]);
    const root = document.createElement("div");
    document.body.replaceChildren(root);
    shell = new Shell(root, backend);
    await shell.start();

    // Every action the bar (find box included), the tabs and the menus offer.
    const offered = new Set(
      [...root.querySelectorAll<HTMLElement>(".bar [data-action], .tabs [data-action]")].map(
        (el) => el.dataset.action as keyof typeof actions,
      ),
    );
    expect(offered.size).toBeGreaterThan(10);

    // Help › Keyboard shortcuts lists each one with its key, and no key is used twice.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F1", bubbles: true }));
    const panel = root.querySelector(".shortcuts");
    expect(panel).not.toBeNull();
    const listed = new Map(
      [...(panel?.querySelectorAll<HTMLElement>("tr[data-action]") ?? [])].map((row) => [
        row.dataset.action,
        row.querySelector("kbd")?.textContent ?? "",
      ]),
    );
    const missing = [...offered].filter(
      (id) => !actions[id].key || listed.get(id) !== actions[id].key,
    );
    expect(missing).toEqual([]);
    const keys = Object.values(actions).map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(panel?.closest("dialog, [role=dialog], [aria-modal]")).toBeNull();

    // Esc puts it away again.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector(".shortcuts")).toBeNull();
  });
});
