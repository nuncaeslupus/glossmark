import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { start } from "./main";
import { strings } from "./strings";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const calls: string[] = [];
let onOpenFiles: (e: { payload: { paths: string[] } }) => void = () => {};

beforeEach(() => {
  calls.length = 0;
  vi.mocked(listen).mockImplementation(async (event, handler) => {
    calls.push(`listen ${event}`);
    if (event === "open-files") onOpenFiles = handler as typeof onOpenFiles;
    return () => {};
  });
  vi.mocked(invoke).mockImplementation(async (cmd, args) => {
    calls.push(cmd);
    const path = (args as { path?: string } | undefined)?.path;
    switch (cmd) {
      case "take_open_files":
        return { paths: ["/n/a.md"] };
      case "get_config":
        return {
          version: 1,
          theme: "system",
          defaultZoom: 100,
          remoteImages: true,
          recentFiles: [],
        };
      case "read_user_css":
        return { css: null };
      case "read_document":
        return { path, text: `# ${path}`, mtime_ms: 0 };
      default:
        return null;
    }
  });
});

describe("boot", () => {
  it("test_app_boot_with_no_file_shows_empty_state", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd) =>
      cmd === "take_open_files" ? { paths: [] } : { recentFiles: [] },
    );
    const root = document.createElement("div");
    await start(root);
    expect(root.querySelector("main.empty")?.textContent).toBe(strings.emptyState);
    expect(root.querySelector<HTMLElement>("main.empty")?.hidden).toBe(false);
  });

  it("test_app_boot_listens_then_opens_launch_files", async () => {
    const root = document.createElement("div");
    await start(root);
    expect(calls.slice(0, 6)).toEqual([
      "listen open-files",
      "listen document-changed",
      "listen update-available",
      "get_config",
      "read_user_css",
      "take_open_files",
    ]);
    expect(calls).toContain("watch");
    // The update check waits until the launch files are drawn.
    expect(calls.at(-1)).toBe("check_update");
    expect(root.querySelector(".sheet h1")?.textContent).toBe("/n/a.md");

    onOpenFiles({ payload: { paths: ["/n/b.md", "/n/a.md"] } });
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelectorAll(".tab")).toHaveLength(2);
    expect(root.querySelector(".tab.active")?.textContent).toContain("a.md");
  });
});
