#!/usr/bin/env node
/**
 * Encodes the generated flight clips for the web.
 *
 *   node scripts/build-film.mjs [source-dir]
 *
 * The source directory (default: media/film-src/uhd, not committed) holds
 * the seven clips upscaled to 4K (3840×2160), named clip-0.mp4 … clip-6.mp4.
 * docs/FILM.md lists where each one came from.
 *
 * Output, in public/film:
 *   wide-uhd/, wide/, wide-sd/   16:9 at 1440, 1080 and 720 lines
 *   tall-uhd/, tall/, tall-sd/   4:3 centre crop at 1440, 1080 and 720 lines,
 *                                for portrait screens
 *   {wide,tall}/poster-N.webp    the clip's first frame, shown while it loads
 *
 * Every size is a downscale of the 4K master, which keeps the detail the
 * upscaler restored. Clips are scrubbed by scroll, not played, so they are
 * encoded for seeking: a keyframe every 12 frames (half a second), no
 * B-frames, no audio, and the index at the front of the file.
 *
 * Needs ffmpeg on the PATH.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(process.argv[2] ?? join(root, "media", "film-src", "uhd"));
const output = join(root, "public", "film");

const CLIPS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The 4K masters carry a thin border (6 px top and bottom). Each framing
 * crops inside it to its exact aspect ratio, centred, then scales down.
 */
const WIDE_CROP = "crop=3808:2142:16:9";
const TALL_CROP = "crop=2856:2142:492:9";
const scaled = (crop, width, height) => `${crop},scale=${width}:${height}:flags=lanczos`;

const VARIANTS = {
  "wide-uhd": { filter: scaled(WIDE_CROP, 2560, 1440), crf: 24, poster: false },
  wide: { filter: scaled(WIDE_CROP, 1920, 1080), crf: 23, poster: true },
  "wide-sd": { filter: scaled(WIDE_CROP, 1280, 720), crf: 24, poster: false },
  "tall-uhd": { filter: scaled(TALL_CROP, 1920, 1440), crf: 24, poster: false },
  tall: { filter: scaled(TALL_CROP, 1440, 1080), crf: 23, poster: true },
  "tall-sd": { filter: scaled(TALL_CROP, 960, 720), crf: 24, poster: false },
};

const seekableH264 = (crf) => [
  "-an",
  "-c:v", "libx264",
  "-preset", "slow",
  "-tune", "film",
  "-crf", String(crf),
  "-profile:v", "high",
  "-pix_fmt", "yuv420p",
  "-g", "12",
  "-keyint_min", "12",
  "-sc_threshold", "0",
  "-bf", "0",
  "-movflags", "+faststart",
];

function ffmpeg(args) {
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "inherit" });
}

const kb = (file) => `${Math.round(statSync(file).size / 1024)} KB`;

if (!existsSync(source)) {
  console.error(`No source clips at ${source}. See docs/FILM.md.`);
  process.exit(1);
}

for (const [name, variant] of Object.entries(VARIANTS)) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });

  for (const clip of CLIPS) {
    const input = join(source, `clip-${clip}.mp4`);
    const video = join(dir, `clip-${clip}.mp4`);
    ffmpeg(["-i", input, "-vf", variant.filter, ...seekableH264(variant.crf), video]);
    let line = `${name}/clip-${clip}.mp4 ${kb(video)}`;

    if (variant.poster) {
      // Taken from the encoded clip, so it matches its first frame exactly
      // and the swap from still to video is invisible.
      const poster = join(dir, `poster-${clip}.webp`);
      ffmpeg(["-i", video, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", poster]);
      line += `, poster ${kb(poster)}`;
    }
    console.log(line);
  }
}
