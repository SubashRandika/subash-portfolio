/**
 * The master flight timeline.
 *
 * `progress` is a normalized number from 0 (parked on the runway) to 1 (above
 * the clouds). Every chapter owns a contiguous slice of it. These ranges are
 * the single source of truth for scroll layout, camera choreography, HUD and
 * chapter navigation.
 */

export type ChapterNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** 0 means the opening / takeoff sequence before chapter 1. */
export type TimelineSegment = 0 | ChapterNumber;

export type ProgressRange = readonly [start: number, end: number];

export const OPENING_RANGE: ProgressRange = [0, 0.08];

export const CHAPTER_RANGES: Readonly<Record<ChapterNumber, ProgressRange>> = {
  1: [0.08, 0.22],
  2: [0.22, 0.38],
  3: [0.38, 0.51],
  4: [0.51, 0.65],
  5: [0.65, 0.84],
  6: [0.84, 1],
};

export const CHAPTER_NUMBERS: readonly ChapterNumber[] = [1, 2, 3, 4, 5, 6];

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function rangeOf(segment: TimelineSegment): ProgressRange {
  return segment === 0 ? OPENING_RANGE : CHAPTER_RANGES[segment];
}

/** Length of a segment as a fraction of the whole flight. */
export function spanOf(segment: TimelineSegment): number {
  const [start, end] = rangeOf(segment);
  return end - start;
}

/**
 * Which segment a progress value falls in. Boundaries belong to the later
 * segment, so progress 0.22 is already chapter 2; progress 1 is chapter 6.
 */
export function segmentAt(progress: number): TimelineSegment {
  const p = clamp01(progress);
  if (p < OPENING_RANGE[1]) return 0;
  for (const chapter of CHAPTER_NUMBERS) {
    if (p < CHAPTER_RANGES[chapter][1]) return chapter;
  }
  return 6;
}

/** Progress within a segment, clamped to 0–1. */
export function localProgress(progress: number, segment: TimelineSegment): number {
  const [start, end] = rangeOf(segment);
  return clamp01((clamp01(progress) - start) / (end - start));
}

/** Converts progress within a segment back to global progress. */
export function globalProgress(local: number, segment: TimelineSegment): number {
  const [start, end] = rangeOf(segment);
  return start + clamp01(local) * (end - start);
}

/** DOM id of the element that begins a segment. Used for anchor navigation. */
export function segmentId(segment: TimelineSegment): string {
  return segment === 0 ? "takeoff" : `chapter-0${segment}`;
}
