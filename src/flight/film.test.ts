import { describe, expect, it } from "vitest";
import {
  CLIP_INDICES,
  FILM_CUES,
  JOIN_BLEND,
  clipSrc,
  clipTime,
  filmFrameAt,
  filmPosition,
  filmQualityFor,
  linesNeeded,
  loadOrder,
  posterSrc,
} from "./film";
import { CHAPTER_RANGES, CHAPTER_NUMBERS, OPENING_RANGE } from "./timeline";

describe("film position", () => {
  it("runs the whole film over the whole flight", () => {
    expect(filmPosition(0)).toBe(0);
    expect(filmPosition(1)).toBe(CLIP_INDICES.length);
    expect(filmPosition(-1)).toBe(0);
    expect(filmPosition(2)).toBe(CLIP_INDICES.length);
  });

  it("puts each chapter's start on its cue", () => {
    expect(filmPosition(OPENING_RANGE[1])).toBeCloseTo(FILM_CUES[1], 10);
    for (const chapter of CHAPTER_NUMBERS) {
      expect(filmPosition(CHAPTER_RANGES[chapter][0])).toBeCloseTo(FILM_CUES[chapter], 10);
    }
  });

  it("only ever moves forward as progress grows, so scrolling back reverses it", () => {
    let previous = -1;
    for (let i = 0; i <= 2000; i++) {
      const position = filmPosition(i / 2000);
      expect(position).toBeGreaterThanOrEqual(previous);
      previous = position;
    }
  });

  it("keeps the film's speed continuous across chapter boundaries", () => {
    const speed = (p: number) => (filmPosition(p + 1e-5) - filmPosition(p - 1e-5)) / 2e-5;
    for (const chapter of CHAPTER_NUMBERS) {
      const at = CHAPTER_RANGES[chapter][0];
      const before = speed(at - 1e-3);
      const after = speed(at + 1e-3);
      expect(Math.abs(after - before) / Math.max(before, after)).toBeLessThan(0.08);
    }
  });

  it("has cues in order within the film", () => {
    for (let i = 1; i < FILM_CUES.length; i++) {
      expect(FILM_CUES[i]).toBeGreaterThan(FILM_CUES[i - 1]!);
    }
  });
});

describe("film frames", () => {
  it("starts on the first frame and ends on the last", () => {
    expect(filmFrameAt(0)).toEqual({ clip: 0, local: 0, next: null, blend: 0 });
    expect(filmFrameAt(1)).toEqual({ clip: 6, local: 1, next: null, blend: 0 });
  });

  it("fades the next clip in just before each join", () => {
    for (let clip = 0; clip < 6; clip++) {
      // A progress value whose film position sits just before the join.
      let progress = 0;
      while (filmPosition(progress) < clip + 1 - JOIN_BLEND / 2) progress += 1e-5;
      const frame = filmFrameAt(progress);
      expect(frame.clip).toBe(clip);
      expect(frame.next).toBe(clip + 1);
      expect(frame.blend).toBeGreaterThan(0.3);
      expect(frame.blend).toBeLessThan(0.7);
    }
  });

  it("shows a single clip away from the joins", () => {
    const frame = filmFrameAt(0.3);
    expect(frame.next).toBeNull();
    expect(frame.blend).toBe(0);
  });

  it("is deterministic", () => {
    for (const progress of [0.04, 0.2, 0.5, 0.77, 0.93]) {
      expect(filmFrameAt(progress)).toEqual(filmFrameAt(progress));
    }
  });
});

describe("clip time", () => {
  it("maps position within a clip to seconds, short of the very end", () => {
    expect(clipTime(0, 5)).toBe(0);
    expect(clipTime(0.5, 5)).toBe(2.5);
    expect(clipTime(1, 5)).toBeLessThan(5);
    expect(clipTime(1, 5)).toBeGreaterThan(4.9);
  });

  it("waits for a known duration", () => {
    expect(clipTime(0.5, Number.NaN)).toBe(0);
    expect(clipTime(0.5, 0)).toBe(0);
  });
});

describe("loading", () => {
  it("loads every clip once, nearest first and favouring ahead", () => {
    expect(loadOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(loadOrder(3)).toEqual([3, 4, 5, 2, 6, 1, 0]);
    expect(loadOrder(6)).toEqual([6, 5, 4, 3, 2, 1, 0]);
    for (const clip of CLIP_INDICES) {
      expect([...loadOrder(clip)].sort()).toEqual([...CLIP_INDICES]);
    }
  });

  it("names clip files per framing and quality, and stills per framing", () => {
    expect(clipSrc(2, "wide", "hd")).toBe("/film/wide/clip-2.mp4");
    expect(clipSrc(2, "wide", "uhd")).toBe("/film/wide-uhd/clip-2.mp4");
    expect(clipSrc(2, "tall", "sd")).toBe("/film/tall-sd/clip-2.mp4");
    expect(posterSrc(5, "tall")).toBe("/film/tall/poster-5.webp");
  });
});

describe("quality", () => {
  it("measures the picture a stage needs in device pixels", () => {
    // 16:9 desktop: the height decides.
    expect(linesNeeded({ width: 1920, height: 1080 }, "wide", 1)).toBe(1080);
    // Ultrawide: the width decides, because the film covers the box.
    expect(linesNeeded({ width: 3440, height: 1440 }, "wide", 1)).toBeCloseTo(1935, 0);
    expect(linesNeeded({ width: 1440, height: 900 }, "wide", 2)).toBe(1800);
    expect(linesNeeded({ width: 390, height: 460 }, "tall", 3)).toBe(1380);
  });

  it("serves 1440 lines to screens that would enlarge 1080", () => {
    expect(filmQualityFor("4g", 1080)).toBe("hd");
    expect(filmQualityFor("4g", 1200)).toBe("hd");
    expect(filmQualityFor("4g", 1440)).toBe("uhd");
    expect(filmQualityFor(undefined, 1800)).toBe("uhd");
  });

  it("uses the lighter clips on 3G whatever the screen", () => {
    expect(filmQualityFor("3g", 2160)).toBe("sd");
  });
});
