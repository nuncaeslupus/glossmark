// Draws the README hero (docs/hero.svg, docs/hero.png) and screenshots (docs/screenshot-*.png).
// Run through `make hero`, which serves the e2e build the screenshots are taken from.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = process.env.HERO_URL ?? "http://localhost:4199";
const W = 1280;
const H = 640;
const c = {
  bg: "#17140f",
  grid: "#272118",
  line: "#5a4d3a",
  cream: "#f3e9d2",
  muted: "#a89a82",
  orange: "#e8742a",
  yellow: "#f8cf4f",
  card: "#211c15",
};
const sans = "'Inter Variable', Inter, sans-serif";
const mono = "'JetBrains Mono Variable', 'JetBrains Mono', monospace";

async function screenshots(browser) {
  const shots = {};
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    await page.goto(`${base}/e2e/shell.html?demo`);
    await page.locator(".katex").first().waitFor({ state: "attached" });
    await page.waitForTimeout(500);
    const path = `docs/screenshot-${scheme}.png`;
    await page.screenshot({ path });
    shots[scheme] = readFileSync(path).toString("base64");
    await page.close();
  }
  return shots;
}

/** The engineering-sheet frame: grid, border, zone letters and numbers, registration marks. */
function frame() {
  const out = [`<rect width="${W}" height="${H}" fill="${c.bg}"/>`];
  for (let x = 0; x <= W; x += 20)
    out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${c.grid}" stroke-width="${x % 100 ? 0.4 : 1}"/>`);
  for (let y = 0; y <= H; y += 20)
    out.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${c.grid}" stroke-width="${y % 100 ? 0.4 : 1}"/>`);
  out.push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" fill="none" stroke="${c.line}"/>`);
  out.push(`<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="${c.muted}" stroke-width="1.5"/>`);
  const zone = `font-family="${mono}" font-size="9" fill="${c.muted}" text-anchor="middle"`;
  for (let i = 0; i < 8; i++) {
    const x = 30 + ((W - 60) / 8) * (i + 0.5);
    out.push(`<text x="${x}" y="27" ${zone}>${8 - i}</text>`, `<text x="${x}" y="${H - 19}" ${zone}>${8 - i}</text>`);
  }
  "ABCD".split("").forEach((l, i) => {
    const y = 30 + ((H - 60) / 4) * (i + 0.5);
    out.push(`<text x="23" y="${y}" ${zone}>${l}</text>`, `<text x="${W - 23}" y="${y}" ${zone}>${l}</text>`);
  });
  for (const [x, y] of [[48, 48], [48, H - 48]])
    out.push(
      `<g stroke="${c.orange}" fill="none"><circle cx="${x}" cy="${y}" r="9"/><line x1="${x - 14}" y1="${y}" x2="${x + 14}" y2="${y}"/><line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y + 14}"/></g>`,
    );
  return out.join("\n");
}

/** A screenshot in a window outline, `w` wide at 3:2. */
function window(x, y, w, png, label) {
  const h = (w * 2) / 3;
  return `<g>
  <rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${h + 2}" rx="7" fill="${c.line}"/>
  <clipPath id="clip-${label}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/></clipPath>
  <image x="${x}" y="${y}" width="${w}" height="${h}" clip-path="url(#clip-${label})" href="data:image/png;base64,${png}"/>
</g>`;
}

function card(y, title, detail, state, hot) {
  const x = 830;
  const w = 386;
  return `<g>
  <rect x="${x}" y="${y}" width="${w}" height="64" rx="4" fill="${hot ? "#2c1f12" : c.card}" stroke="${hot ? c.orange : c.line}" stroke-width="${hot ? 1.5 : 1}"/>
  <rect x="${x}" y="${y}" width="5" height="64" fill="${hot ? c.orange : c.line}"/>
  <text x="${x + 22}" y="${y + 29}" font-family="${sans}" font-size="21" font-weight="650" fill="${c.cream}">${title}</text>
  <text x="${x + 22}" y="${y + 51}" font-family="${sans}" font-size="13" fill="${c.muted}">${detail}</text>
  <text x="${x + w - 18}" y="${y + 29}" font-family="${mono}" font-size="12" letter-spacing="2" text-anchor="end" fill="${hot ? c.orange : c.muted}">${state}</text>
</g>`;
}

function titleBlock() {
  const y = 520;
  const cells = [
    [830, 140, "PROJECT", "nacho-viewer", 16],
    [970, 176, "PLATFORMS", "Linux · Windows · macOS", 11],
    [1146, 70, "LICENSE", "MIT", 14],
  ];
  return cells
    .map(
      ([x, w, k, v, size]) => `<rect x="${x}" y="${y}" width="${w}" height="74" fill="${c.card}" stroke="${c.muted}"/>
  <text x="${x + 12}" y="${y + 22}" font-family="${mono}" font-size="9" letter-spacing="2" fill="${c.muted}">${k}</text>
  <text x="${x + 12}" y="${y + 52}" font-family="${mono}" font-size="${size}" font-weight="600" fill="${c.cream}">${v}</text>`,
    )
    .join("\n");
}

function hero(shots) {
  const logo = readFileSync("logo.svg", "utf8").replace("<svg ", '<svg x="70" y="74" width="132" height="132" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${frame()}
${logo}
<text x="216" y="170" font-family="${sans}" font-size="80" font-weight="800" letter-spacing="-2" fill="${c.cream}">Nacho <tspan fill="${c.orange}">Viewer</tspan></text>
<text x="74" y="254" font-family="${sans}" font-size="34" fill="${c.cream}">Markdown, beautifully printed.</text>
<text x="74" y="290" font-family="${sans}" font-size="18" fill="${c.muted}">Every .md file opens as a typeset page · light and dark · print to PDF</text>
${window(74, 322, 340, shots.light, "light")}
${window(350, 370, 340, shots.dark, "dark")}
<text x="830" y="104" font-family="${mono}" font-size="12" letter-spacing="3" fill="${c.orange}">ONE FREE VIEWER</text>
${card(120, "Markdown", "GFM · math · Mermaid · code · footnotes", "NOW", true)}
${card(200, "Images", "zoom · rotate · save", "NEXT", false)}
${card(280, "PDF", "view · reorder · rotate pages", "NEXT", false)}
<text x="830" y="390" font-family="${mono}" font-size="12" letter-spacing="3" fill="${c.orange}">READS LIKE A DOCUMENT</text>
<text x="830" y="420" font-family="${sans}" font-size="15" fill="${c.cream}">Tabs · outline · find · live reload</text>
<text x="830" y="446" font-family="${sans}" font-size="15" fill="${c.cream}">View source · zoom to fit · export</text>
<text x="830" y="472" font-family="${sans}" font-size="15" fill="${c.muted}">A viewer, not an editor.</text>
${titleBlock()}
</svg>
`;
}

const fonts = ["inter", "jetbrains-mono"]
  .map((f) => {
    const name = f === "inter" ? "Inter Variable" : "JetBrains Mono Variable";
    const file = `node_modules/@fontsource-variable/${f}/files/${f}-latin-wght-normal.woff2`;
    const data = readFileSync(file).toString("base64");
    return `@font-face{font-family:'${name}';font-weight:100 900;src:url(data:font/woff2;base64,${data})}`;
  })
  .join("");

const browser = await chromium.launch();
const svg = hero(await screenshots(browser));
writeFileSync("docs/hero.svg", svg);
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(`<style>${fonts}body{margin:0}</style>${svg}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: "docs/hero.png" });
await browser.close();
