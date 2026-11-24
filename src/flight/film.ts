/**
 * The filmed flight.
 *
 * The journey is seven short video clips played end to end. Each clip was
 * generated between two keyframes and starts on the frame the previous one
 * ends on, so in order they form one continuous flight:
 *
 *   clip 0  runway at dawn → climbing out over the coast
 *   clip 1  coast → through a cloud bank → green mountain valley
 *   clip 2  valley → through valley mist → industrial region
 *   clip 3  industrial region → through cloud → open terrain seen from above
 *   clip 4  terrain → through cloud → city on a river
 *   clip 5  city → up through the clouds
 *   clip 6  above the clouds → wide shot into the sunrise
 *
 * Every change of landscape happens while the aircraft is inside cloud, the
 * way a film would cut between locations in one take; nothing morphs in
 * plain view.
 *
 * Clips change landscape part-way through, so they do not line up with
 * chapters. Instead the film has one continuous position, measured in clips
 * (0 = first frame of clip 0, 7 = last frame of clip 6), and every timeline
 * segment owns a stretch of it, starting where the cloud is thickest
 * (FILM_CUES). A chapter's text leaves as the aircraft enters the cloud and
 * the next one arrives as it comes out over the new landscape. Scroll
 * progress picks the position; nothing plays on its own.
 *
 * Every clip comes in two framings, each at two qualities:
 *   - "wide"  16:9, for landscape screens;
 *   - "tall"  a 4:3 centre crop, for portrait screens, where the film fills
 *             the top of the frame and the chapter text sits beneath it;
 *   - "uhd"   1440 lines, for large and high-density screens;
 *   - "hd"    1080 lines;
 *   - "sd"    720 lines, for slow (3G) connections.
 * All are cut from 4K masters (the generated clips upscaled), so even the
 * smaller sizes are downscaled, never upscaled.
 *
 * This module is framework-free so the mapping can be unit-tested.
 */

import { CHAPTER_RANGES, OPENING_RANGE, clamp01 } from "./timeline";

export type FilmFraming = "wide" | "tall";

export type FilmQuality = "uhd" | "hd" | "sd";

/** Lines of picture in each quality. */
export const QUALITY_LINES: Readonly<Record<FilmQuality, number>> = {
  uhd: 1440,
  hd: 1080,
  sd: 720,
};

/** Pixel size of the stills (the HD first frames) in each framing. */
export const STILL_SIZE: Readonly<Record<FilmFraming, { width: number; height: number }>> = {
  wide: { width: 1920, height: 1080 },
  tall: { width: 1440, height: 1080 },
};

export type ClipIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const CLIP_INDICES: readonly ClipIndex[] = [0, 1, 2, 3, 4, 5, 6];

const LAST_CLIP: ClipIndex = 6;
const FILM_LENGTH = CLIP_INDICES.length;

/**
 * Film position at the start of the opening, of each chapter, and at the end
 * of the flight. Read off the generated clips (see docs/FILM.md):
 *
 *   opening    0.00  runway roll, rotation, liftoff
 *   chapter 1  0.62  climbing out over the coast
 *   chapter 2  1.55  deepest in the cloud bank before the valley
 *   chapter 3  2.55  deepest in the valley mist before the industry
 *   chapter 4  3.46  deepest in the cloud before the terrain map
 *   chapter 5  4.58  the whiteout before the city
 *   chapter 6  5.50  inside the clouds, climbing to the sunrise
 */
export const FILM_CUES = [0, 0.62, 1.55, 2.55, 3.46, 4.58, 5.5, FILM_LENGTH] as const;

/** Progress at the same points: the start of each timeline segment, and 1. */
const PROGRESS_CUES = [
  OPENING_RANGE[0],
  CHAPTER_RANGES[1][0],
  CHAPTER_RANGES[2][0],
  CHAPTER_RANGES[3][0],
  CHAPTER_RANGES[4][0],
  CHAPTER_RANGES[5][0],
  CHAPTER_RANGES[6][0],
  1,
] as const;

/**
 * Length of film, in clips, over which the next clip fades in before a join.
 * Consecutive clips meet on the same keyframe, so the fade only has to hide
 * the small differences the video model leaves there.
 */
export const JOIN_BLEND = 0.08;

/** Frames are never asked for closer than this to a clip's last frame. */
const END_GUARD_SECONDS = 0.05;

/** Media query that selects the tall framing. Matches the CSS layout. */
export const TALL_QUERY = "(max-aspect-ratio: 1/1)";

const FILM_ROOT = "/film";

export function clipSrc(clip: ClipIndex, framing: FilmFraming, quality: FilmQuality): string {
  const folder = quality === "hd" ? framing : `${framing}-${quality}`;
  return `${FILM_ROOT}/${folder}/clip-${clip}.mp4`;
}

/** The first frame of a clip, shown until the clip has loaded. */
export function posterSrc(clip: ClipIndex, framing: FilmFraming): string {
  return `${FILM_ROOT}/${framing}/poster-${clip}.webp`;
}

/**
 * Lines of film picture a stage needs to be shown pixel for pixel: the film
 * covers its box, so the box's height or its width at the film's aspect
 * ratio, whichever is larger, in device pixels.
 */
export function linesNeeded(
  box: { width: number; height: number },
  framing: FilmFraming,
  devicePixelRatio: number,
): number {
  const aspect = framing === "wide" ? 16 / 9 : 4 / 3;
  return Math.max(box.height, box.width / aspect) * devicePixelRatio;
}

/**
 * Picks the film quality: the lighter clips on a 3G-class connection, where
 * they start sooner; otherwise the smallest quality that fills the screen
 * without being enlarged by more than a little. (2G and data-saver visitors
 * get the static experience; see the head script.)
 */
export function filmQualityFor(effectiveType: string | undefined, lines: number): FilmQuality {
  if (effectiveType === "3g") return "sd";
  return lines > QUALITY_LINES.hd * 1.12 ? "uhd" : "hd";
}

/**
 * Slopes for a monotone cubic through the cues (Fritsch–Carlson), so the
 * film never runs backward between cues and its speed changes smoothly
 * instead of jumping at every chapter boundary.
 */
const CUE_SLOPES: readonly number[] = (() => {
  const n = PROGRESS_CUES.length;
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    secants.push((FILM_CUES[i + 1]! - FILM_CUES[i]!) / (PROGRESS_CUES[i + 1]! - PROGRESS_CUES[i]!));
  }
  const slopes = [secants[0]!];
  for (let i = 1; i < n - 1; i++) {
    const before = secants[i - 1]!;
    const after = secants[i]!;
    // Harmonic mean: stays between the neighbouring secants, so no overshoot.
    slopes.push(before * after <= 0 ? 0 : (2 * before * after) / (before + after));
  }
  slopes.push(secants[n - 2]!);
  return slopes;
})();

/** Film position (0–7, in clips) for a flight progress value. */
export function filmPosition(progress: number): number {
  const p = clamp01(progress);
  let i = 0;
  while (i < PROGRESS_CUES.length - 2 && p > PROGRESS_CUES[i + 1]!) i++;

  const x0 = PROGRESS_CUES[i]!;
  const h = PROGRESS_CUES[i + 1]! - x0;
  const t = h > 0 ? (p - x0) / h : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  // Cubic Hermite basis.
  return (
    (2 * t3 - 3 * t2 + 1) * FILM_CUES[i]! +
    (t3 - 2 * t2 + t) * h * CUE_SLOPES[i]! +
    (-2 * t3 + 3 * t2) * FILM_CUES[i + 1]! +
    (t3 - t2) * h * CUE_SLOPES[i + 1]!
  );
}

export interface FilmFrame {
  /** The clip on screen. */
  clip: ClipIndex;
  /** Position within that clip, 0 (first frame) to 1 (last frame). */
  local: number;
  /** The clip fading in over this one before a join, if any. */
  next: ClipIndex | null;
  /** Opacity of the next clip, 0–1. */
  blend: number;
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Which clip, and where in it, a flight progress value shows. */
export function filmFrameAt(progress: number): FilmFrame {
  const position = filmPosition(progress);
  const clip = Math.min(LAST_CLIP, Math.floor(position)) as ClipIndex;
  const local = clamp01(position - clip);

  const next = clip < LAST_CLIP ? ((clip + 1) as ClipIndex) : null;
  const blend = next === null ? 0 : smoothstep((local - (1 - JOIN_BLEND)) / JOIN_BLEND);

  return blend > 0 ? { clip, local, next, blend } : { clip, local, next: null, blend: 0 };
}

/** The time in seconds to show for a position within a clip. */
export function clipTime(local: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(clamp01(local) * duration, Math.max(0, duration - END_GUARD_SECONDS));
}

/**
 * The order to download clips in, starting from the one on screen: the
 * current clip, then alternately ahead and behind, favouring ahead because
 * visitors mostly scroll forward.
 */
export function loadOrder(current: ClipIndex): ClipIndex[] {
  const order: ClipIndex[] = [current];
  for (let distance = 1; order.length < FILM_LENGTH; distance++) {
    for (const candidate of [current + distance, current + distance + 1, current - distance]) {
      if (candidate < 0 || candidate > LAST_CLIP) continue;
      const clip = candidate as ClipIndex;
      if (!order.includes(clip)) order.push(clip);
    }
  }
  return order;
}
