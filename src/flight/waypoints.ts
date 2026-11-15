/**
 * Where things happen on the timeline inside each segment.
 *
 * A chapter's progress range is divided into an introduction, a run of
 * milestone waypoints and an exit. These positions drive the text
 * choreography, the HUD's waypoint ticks and "fly to" navigation, so all
 * three always agree.
 */

import {
  CHAPTER_RANGES,
  type ChapterNumber,
  OPENING_RANGE,
  type TimelineSegment,
  rangeOf,
} from "./timeline";

/** Fractions of a chapter's own span. */
const INTRO_IN = [0.03, 0.1] as const;
const MILESTONES_FROM = 0.2;
const MILESTONES_TO = 0.84;
const EXIT = [0.9, 0.975] as const;

/** The final chapter makes room for the closing message. */
const FINAL_MILESTONES_TO = 0.5;
const FINAL_EXIT = [0.58, 0.66] as const;
const CLOSING_IN = [0.7, 0.8] as const;

const FINAL_CHAPTER: ChapterNumber = 6;

function within(chapter: ChapterNumber, fraction: number): number {
  const [start, end] = CHAPTER_RANGES[chapter];
  return start + (end - start) * fraction;
}

export interface ChapterBeats {
  /** The chapter heading fades in over this range. */
  introIn: readonly [number, number];
  /** The chapter's text fades out over this range. */
  exit: readonly [number, number];
  /** Progress at which each milestone becomes the current one. */
  milestones: readonly number[];
  /** Final chapter only: the closing message fades in over this range. */
  closingIn: readonly [number, number] | null;
}

export function chapterBeats(chapter: ChapterNumber, milestoneCount: number): ChapterBeats {
  const final = chapter === FINAL_CHAPTER;
  const to = final ? FINAL_MILESTONES_TO : MILESTONES_TO;
  const exit = final ? FINAL_EXIT : EXIT;

  const milestones: number[] = [];
  for (let i = 0; i < milestoneCount; i++) {
    const t = milestoneCount === 1 ? 0 : i / (milestoneCount - 1);
    milestones.push(within(chapter, MILESTONES_FROM + (to - MILESTONES_FROM) * t));
  }

  return {
    introIn: [within(chapter, INTRO_IN[0]), within(chapter, INTRO_IN[1])],
    exit: [within(chapter, exit[0]), within(chapter, exit[1])],
    milestones,
    closingIn: final ? [within(chapter, CLOSING_IN[0]), within(chapter, CLOSING_IN[1])] : null,
  };
}

/** The opening text leaves as the takeoff roll begins. */
export const OPENING_EXIT: readonly [number, number] = [
  OPENING_RANGE[1] * 0.34,
  OPENING_RANGE[1] * 0.56,
];

/**
 * Where "fly to this segment" lands: just after the heading has finished
 * fading in, so the visitor arrives looking at the chapter title.
 */
export function segmentArrival(segment: TimelineSegment): number {
  if (segment === 0) return 0;
  const [start, end] = rangeOf(segment);
  return start + (end - start) * (INTRO_IN[1] + 0.02);
}

/** Where "fly to this milestone" lands: just after it becomes current. */
export function milestoneArrival(
  chapter: ChapterNumber,
  index: number,
  milestoneCount: number,
): number {
  const beats = chapterBeats(chapter, milestoneCount);
  const at = beats.milestones[index];
  if (at === undefined) throw new Error(`Chapter ${chapter} has no milestone ${index}.`);
  return at + 0.0015;
}
