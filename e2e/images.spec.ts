import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { FAKE_IMAGE_ORIGIN } from "../src/ui/fake-backend";

const DOC = "/notes/readme.md";

// Every way a document can name a remote image, plus a local raster and a local SVG that
// itself points outside.
const FILES = {
  [DOC]: [
    "# Images",
    "![photo](img/photo.png)",
    "![flow](img/flow.svg)",
    "![remote](https://example.com/a.png)",
    "![protocol-relative](//example.com/b.png)",
    "![no-slashes](https:example.com/f.png) ![upper](HTTPS://EXAMPLE.COM/g.png)",
    '<img src="https://example.com/c.png" srcset="https://example.com/c2.png 2x" alt="c">',
    '<picture><source srcset="https://example.com/d.png"><img src="http://example.com/e.png" alt="e"></picture>',
  ].join("\n\n"),
  "/notes/img/flow.svg": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <style>@import url(https://example.org/theme.css);</style>
    <image href="https://example.org/inner.png" width="5" height="5"/>
    <use href="https://example.org/sprite.svg#x"/>
    <rect width="10" height="10" style="fill: url(https://example.org/fill.svg#f)"/>
    <path d="M0 0h10" stroke="currentColor"/>
  </svg>`,
};

const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

/**
 * Starts the shell on the in-memory core with `DOC` open, recording every request: the
 * harness's own, the `image:` protocol's (answered with a blank image) and the rest (aborted, so
 * the test never touches the network).
 */
async function open(page: Page, remoteImages: boolean, baseURL: string | undefined) {
  const appOrigin = new URL(baseURL ?? "").origin;
  const seen = { images: [] as string[], remote: [] as string[] };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol === "data:" || url.origin === appOrigin) return;
    if (url.origin === FAKE_IMAGE_ORIGIN)
      seen.images.push(decodeURIComponent(url.pathname.slice(1)));
    else seen.remote.push(url.href);
  });
  await page.route(
    (url) => url.origin !== appOrigin,
    (route) =>
      new URL(route.request().url()).origin === FAKE_IMAGE_ORIGIN
        ? route.fulfill({ contentType: "image/svg+xml", body: BLANK })
        : route.abort(),
  );
  await page.goto("/e2e/harness.html");
  await page.evaluate(
    ([files, doc, remoteImages]) => window.harness.app(files, [doc], { remoteImages }),
    [FILES, DOC, remoteImages] as const,
  );
  await expect(page.locator(".sheet svg path[stroke]")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  return seen;
}

test("test_remote_images_off_no_requests", async ({ page, baseURL }) => {
  const requests = await open(page, false, baseURL);
  console.log(`network_requests_with_remote_images_off=${requests.remote.length}`);
  expect(requests.remote).toEqual([]);
  // The document did render its local images, so the zero above is not an empty page.
  expect(requests.images).toEqual(["/notes/img/photo.png"]);
  await expect(page.locator(".sheet img[data-remote-src]")).toHaveCount(6);
});

test("test_remote_images_off_csp_blocks_late_image", async ({ page, baseURL }) => {
  await open(page, false, baseURL);
  // The second lock: an image that bypassed the sanitiser is still refused by the CSP.
  const blocked = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", (e) => resolve(e.blockedURI));
        const img = document.createElement("img");
        img.src = "https://example.com/late.png";
        document.body.append(img);
      }),
  );
  expect(blocked).toBe("https://example.com/late.png");
});

test("test_images_follow_zoom", async ({ page, baseURL }) => {
  await open(page, false, baseURL);
  // The harness renders unstyled and its CSP refuses <style>; an adopted sheet gets past it.
  await page.evaluate(
    (css) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [sheet];
    },
    readFileSync("src/themes/signature.css", "utf8"),
  );
  const photo = page.locator('.sheet img[alt="photo"]');
  const width = async () => (await photo.boundingBox())?.width ?? 0;
  const before = await width();
  await page
    .locator(".view")
    .evaluate((view: HTMLElement) => view.style.setProperty("--zoom", "3"));
  expect(await width()).toBeCloseTo(before * 3, 0);
});

test("test_remote_images_on_requests_only_document_images", async ({ page, baseURL }) => {
  const requests = await open(page, true, baseURL);
  // The control: with the setting on, the same harness does see remote requests.
  expect(requests.remote).toContain("https://example.com/a.png");
  expect(requests.remote).toContain("https://example.com/b.png");
  expect(requests.remote).toContain("https://example.com/f.png");
  expect(requests.remote.filter((url) => url.includes("example.org"))).toEqual([]);
});
