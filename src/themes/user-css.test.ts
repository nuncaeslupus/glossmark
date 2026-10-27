import { afterEach, expect, it } from "vitest";
import { strings } from "../strings";
import { fakeBackend } from "../ui/fake-backend";
import { Shell } from "../ui/shell";

afterEach(() => {
  document.head.replaceChildren();
});

async function start(css: string | null, error?: unknown) {
  const theme = document.createElement("link");
  theme.rel = "stylesheet";
  document.head.append(theme);
  const fake = fakeBackend({});
  fake.state.userCss = css;
  if (error) fake.state.fail.readUserCss = error;
  const root = document.createElement("div");
  const shell = new Shell(root, fake.backend);
  await shell.start();
  shell.dispose();
  return root;
}

it("test_user_css_loaded_last", async () => {
  await start(".sheet { color: red; }");
  const last = document.head.lastElementChild;
  expect(last?.id).toBe("user-css");
  expect(last?.textContent).toBe(".sheet { color: red; }");
});

it("test_user_css_absent_adds_nothing", async () => {
  await start(null);
  expect(document.getElementById("user-css")).toBeNull();
});

it("test_user_css_unreadable_shows_notice", async () => {
  const root = await start(null, { kind: "permission_denied", message: "user.css: denied" });
  expect(document.getElementById("user-css")).toBeNull();
  expect(root.querySelector(".notice")?.textContent).toBe(strings.notices.userCssUnavailable);
});
