import { afterEach, expect, it } from "vitest";
import { fakeBackend } from "../ui/fake-backend";
import { Shell } from "../ui/shell";

afterEach(() => {
  document.head.replaceChildren();
});

async function start(css: string | null) {
  const theme = document.createElement("link");
  theme.rel = "stylesheet";
  document.head.append(theme);
  const fake = fakeBackend({});
  fake.state.userCss = css;
  const shell = new Shell(document.createElement("div"), fake.backend);
  await shell.start();
  shell.dispose();
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
