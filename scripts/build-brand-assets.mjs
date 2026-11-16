/**
 * Builds the brand assets that are committed to the repository:
 *
 *   src/app/icon.svg              the site icon (a vector mark, no lettering)
 *   src/app/apple-icon.png        180 × 180 home-screen icon
 *   src/app/favicon.ico           16, 32 and 48 px, for browsers that ask for it
 *   public/images/subash-rodrigo.jpg   the portrait at a stable URL (JSON-LD)
 *   public/og-image.png           1200 × 630 social sharing image
 *
 *   npm run build && node scripts/build-brand-assets.mjs
 *
 * The sharing image is rendered in Chrome with the site's own typefaces,
 * taken from the production build (hence `npm run build` first), so it
 * matches the design system exactly.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const at = (...parts) => resolve(ROOT, ...parts);

// ---------------------------------------------------------------------------
// Icon: a dawn horizon with a rising trajectory that ends in an accent dot.
// ---------------------------------------------------------------------------

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d1422"/>
      <stop offset="0.6" stop-color="#1c2647"/>
      <stop offset="0.76" stop-color="#8a5a52"/>
      <stop offset="0.79" stop-color="#f4a261"/>
      <stop offset="0.805" stop-color="#05080f"/>
      <stop offset="1" stop-color="#05080f"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#sky)"/>
  <path d="M11 47 C 25 45 37 35 49 17" fill="none" stroke="#f2f1ed" stroke-width="4.6" stroke-linecap="round"/>
  <circle cx="49" cy="16" r="5.2" fill="#f4a261"/>
</svg>
`;

/** An .ico holding PNG images (supported by every current browser). */
function icoFromPngs(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function buildIcons() {
  writeFileSync(at("src/app/icon.svg"), ICON_SVG);
  const svg = Buffer.from(ICON_SVG);
  // The home-screen icon is square; the platform rounds its corners.
  const square = Buffer.from(ICON_SVG.replace('rx="14"', 'rx="0"'));
  await sharp(square, { density: 400 }).resize(180, 180).png().toFile(at("src/app/apple-icon.png"));
  const pngs = [];
  for (const size of [16, 32, 48]) {
    pngs.push({ size, data: await sharp(svg, { density: 400 }).resize(size, size).png().toBuffer() });
  }
  writeFileSync(at("src/app/favicon.ico"), icoFromPngs(pngs));
}

// ---------------------------------------------------------------------------
// Portrait at a stable URL
// ---------------------------------------------------------------------------

async function buildPortrait() {
  mkdirSync(at("public/images"), { recursive: true });
  await sharp(at("src/assets/subash-rodrigo-portrait.jpg"))
    .resize(600, 750)
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(at("public/images/subash-rodrigo.jpg"));
}

// ---------------------------------------------------------------------------
// Social sharing image
// ---------------------------------------------------------------------------

/** The @font-face rules from the production build, pointing at local files. */
function buildFontFaces() {
  const chunks = at(".next/static/chunks");
  const css = readdirSync(chunks)
    .filter((name) => name.endsWith(".css"))
    .map((name) => readFileSync(resolve(chunks, name), "utf8"))
    .find((text) => text.includes("font-family:Michroma"));
  if (!css) throw new Error("Run `npm run build` first: the built fonts were not found.");
  const media = pathToFileURL(at(".next/static/media")).href;
  return (css.match(/@font-face\{[^}]*\}/g) ?? [])
    .filter((rule) => !rule.includes("Fallback"))
    .map((rule) => rule.replaceAll("url(../media/", `url(${media}/`))
    .join("\n");
}

function sharingHtml(fontFaces, portrait) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaces}
* { box-sizing: border-box; margin: 0; }
html, body { width: 1200px; height: 630px; }
body {
  position: relative; overflow: hidden; color: #f2f1ed; font-family: B612, sans-serif;
  background:
    radial-gradient(120% 60% at 30% 100%, rgba(244,162,97,.42), rgba(244,162,97,0) 60%),
    linear-gradient(180deg, #05080f 0%, #0d1422 38%, #1c2647 70%, #4a3550 86%, #8a5a52 100%);
}
.horizon { position: absolute; left: 0; right: 0; top: 548px; height: 2px;
  background: linear-gradient(90deg, rgba(244,162,97,0), #f4a261 30%, #ffd2a6 55%, rgba(244,162,97,0));
  box-shadow: 0 0 28px 6px rgba(244,162,97,.45); }
.ground { position: absolute; left: 0; right: 0; top: 550px; bottom: 0; background: #05080f; }
.text { position: absolute; left: 72px; top: 84px; width: 640px; }
.label { font-family: "B612 Mono", monospace; font-size: 20px; letter-spacing: .22em; color: #f4a261; text-transform: uppercase; }
.name { font-family: Michroma, sans-serif; font-size: 64px; line-height: 1.12; letter-spacing: .02em; margin-top: 30px; text-transform: uppercase; }
.title { font-family: "B612 Mono", monospace; font-size: 22px; letter-spacing: .18em; color: #b9c3d2; margin-top: 26px; text-transform: uppercase; }
.lead { font-size: 27px; line-height: 1.4; color: #dfe6ee; margin-top: 34px; max-width: 600px; }
.plate-wrap { position: absolute; right: 92px; top: 58px; width: 300px; }
.orbit { position: absolute; left: -36px; top: -18px; width: 372px; height: 372px; border-radius: 50%;
  border: 2px dashed rgba(134,197,255,.55); }
.dot { position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #f4a261;
  box-shadow: 0 0 14px 3px rgba(244,162,97,.7); left: 312px; top: 70px; }
.plate { position: relative; width: 300px; height: 375px; border-radius: 6px; overflow: hidden; background: #fff;
  box-shadow: 0 40px 70px -30px rgba(0,0,0,.8); }
.plate img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; display: block; }
.corner { position: absolute; width: 22px; height: 22px; border-color: #f4a261; border-style: solid; border-width: 0; }
.tl { left: -12px; top: -12px; border-top-width: 2px; border-left-width: 2px; }
.tr { right: -12px; top: -12px; border-top-width: 2px; border-right-width: 2px; }
.bl { left: -12px; bottom: -12px; border-bottom-width: 2px; border-left-width: 2px; }
.br { right: -12px; bottom: -12px; border-bottom-width: 2px; border-right-width: 2px; }
.footer { position: absolute; left: 72px; bottom: 30px; font-family: "B612 Mono", monospace; font-size: 18px;
  letter-spacing: .2em; color: #9ca9bd; text-transform: uppercase; }
</style></head><body>
<div class="horizon"></div><div class="ground"></div>
<div class="text">
  <p class="label">Career journey · 2013–present</p>
  <h1 class="name">Subash<br>Rodrigo</h1>
  <p class="title">Lead Software Engineer</p>
  <p class="lead">13+ years building enterprise web platforms, design systems and SaaS with React, Angular and TypeScript.</p>
</div>
<div class="plate-wrap">
  <div class="orbit"></div><div class="dot"></div>
  <div class="plate"><img src="${portrait}" alt=""></div>
  <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
</div>
<p class="footer">React · Angular · TypeScript · Full-stack</p>
</body></html>`;
}

async function buildSharingImage() {
  const portrait = `data:image/jpeg;base64,${readFileSync(at("src/assets/subash-rodrigo-portrait.jpg")).toString("base64")}`;
  const htmlPath = at(".next/og-image.html");
  writeFileSync(htmlPath, sharingHtml(buildFontFaces(), portrait));
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png" });
    await sharp(png).png({ compressionLevel: 9, palette: false }).toFile(at("public/og-image.png"));
  } finally {
    await browser.close();
  }
}

await buildIcons();
await buildPortrait();
await buildSharingImage();
console.log("Brand assets written.");
