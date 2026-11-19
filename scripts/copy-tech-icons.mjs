/**
 * Copies the Devicon icons the technology table uses into public/tech/.
 *
 * Devicon (https://devicon.dev) is MIT-licensed. Only the icons in
 * src/data/technologies.ts are copied, so the 140 MB package never becomes a
 * project dependency:
 *
 *   npm pack devicon@2.18.0 && tar -xzf devicon-2.18.0.tgz
 *   node scripts/copy-tech-icons.mjs path/to/package
 *
 * The coloured "original" variant is preferred, then "plain" (also used
 * when the original is a heavy illustration). Icons are
 * shown through <img>, which never runs scripts, and are checked anyway.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2];
if (!source || !existsSync(resolve(source, "icons"))) {
  console.error("Usage: node scripts/copy-tech-icons.mjs <path to the unpacked devicon package>");
  process.exit(1);
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
  if (!existsSync(dir)) continue; // not an icon name (e.g. a symbol)
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
writeFileSync(
  resolve(target, "README.md"),
  "Icons from Devicon (https://devicon.dev), MIT licence: see LICENSE-devicon.txt.\nLogos are trademarks of their owners and are shown only to name technologies used.\nRegenerate with scripts/copy-tech-icons.mjs.\n",
);
console.log(`Copied ${copied} icons to public/tech/.`);
