/**
 * Copies the Devicon icons the technology table uses into public/tech/.
 *
 * Devicon (https://devicon.dev) is MIT-licensed. Where Devicon has no icon,
 * the brand mark comes from Simple Icons (https://simpleicons.org, CC0), which
 * ships single-colour logos; SIMPLE_ICONS below gives each its colour. Only
 * the icons in src/data/technologies.ts are copied, so neither package becomes
 * a project dependency:
 *
 *   npm pack devicon@2.18.0 simple-icons@16.38.0
 *   (unpack each .tgz into its own folder)
 *   node scripts/copy-tech-icons.mjs path/to/devicon path/to/simple-icons
 *
 * The coloured "original" variant is preferred, then "plain" (also used
 * when the original is a heavy illustration). Icons are
 * shown through <img>, which never runs scripts, and are checked anyway.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [source, simpleSource] = process.argv.slice(2);
if (!source || !simpleSource || ![source, simpleSource].every((dir) => existsSync(resolve(dir, "icons")))) {
  console.error("Usage: node scripts/copy-tech-icons.mjs <unpacked devicon package> <unpacked simple-icons package>");
  process.exit(1);
}

/**
 * Brand marks Devicon lacks, from Simple Icons, in their listed brand colours;
 * Gemini's mark is drawn in its blue-to-rose gradient.
 */
const SIMPLE_ICONS = {
  apachesuperset: { fill: "#20a6c9" },
  googlegemini: { gradient: ["#4796e3", "#9177c7", "#ca6673"] },
  reactquery: { fill: "#ff4154" },
  testinglibrary: { fill: "#e33332" },
};

function simpleIcon(name, { fill, gradient }) {
  const svg = readFileSync(resolve(simpleSource, "icons", `${name}.svg`), "utf8")
    // Shown with alt="" next to the visible name, so no title or role.
    .replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(' role="img"', "");
  if (!gradient) return svg.replace("<svg", `<svg fill="${fill}"`);
  const stops = gradient
    .map((colour, i) => `<stop offset="${i / (gradient.length - 1)}" stop-color="${colour}"/>`)
    .join("");
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>`;
  return svg.replace("<svg", '<svg fill="url(#g)"').replace(/(<svg[^>]*>)/, `$1${defs}`);
}

const data = readFileSync(resolve(ROOT, "src/data/technologies.ts"), "utf8");
const icons = [...new Set([...data.matchAll(/"([a-z0-9]+)"(?:, true)?\),/g)].map((m) => m[1]))];
const target = resolve(ROOT, "public/tech");
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

/** Icons larger than this are replaced by a lighter variant where one exists. */
const MAX_BYTES = 40_000;

let copied = 0;
for (const icon of icons) {
  const dir = resolve(source, "icons", icon);
  if (!existsSync(dir)) {
    if (!(icon in SIMPLE_ICONS)) continue; // not an icon name (e.g. a symbol)
    const svg = simpleIcon(icon, SIMPLE_ICONS[icon]);
    if (/<script|\son\w+=|javascript:/i.test(svg)) throw new Error(`Refusing ${icon}: active content`);
    writeFileSync(resolve(target, `${icon}.svg`), svg);
    copied++;
    continue;
  }
  const files = readdirSync(dir);
  const candidates = [`${icon}-original.svg`, `${icon}-plain.svg`].filter((name) => files.includes(name));
  if (candidates.length === 0) throw new Error(`No usable variant for ${icon}`);
  // A few originals are detailed illustrations; take the plain mark if so.
  const size = (name) => readFileSync(resolve(dir, name)).length;
  const file = candidates.find((name) => size(name) <= MAX_BYTES) ?? candidates.sort((a, b) => size(a) - size(b))[0];
  const svg = readFileSync(resolve(dir, file), "utf8");
  if (/<script|\son\w+=|javascript:/i.test(svg)) throw new Error(`Refusing ${file}: active content`);
  // As a standalone image an SVG must declare its namespace; a few
  // Devicon files rely on being inlined in HTML and omit it.
  const standalone = /<svg[^>]*\sxmlns=/.test(svg)
    ? svg
    : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  writeFileSync(resolve(target, `${icon}.svg`), standalone);
  copied++;
}
copyFileSync(resolve(source, "LICENSE"), resolve(target, "LICENSE-devicon.txt"));
copyFileSync(resolve(simpleSource, "LICENSE.md"), resolve(target, "LICENSE-simple-icons.txt"));
writeFileSync(
  resolve(target, "README.md"),
  `Icons from Devicon (https://devicon.dev), MIT licence: see LICENSE-devicon.txt.\nWhere Devicon has none (${Object.keys(SIMPLE_ICONS).join(", ")}), from Simple Icons (https://simpleicons.org), CC0: see LICENSE-simple-icons.txt.\nLogos are trademarks of their owners and are shown only to name technologies used.\nRegenerate with scripts/copy-tech-icons.mjs.\n`,
);
console.log(`Copied ${copied} icons to public/tech/.`);
