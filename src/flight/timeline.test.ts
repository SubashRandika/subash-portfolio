import { describe, expect, it } from "vitest";
import {
  CHAPTER_NUMBERS,
  CHAPTER_RANGES,
  OPENING_RANGE,
  globalProgress,
  localProgress,
  segmentAt,
  segmentId,
  spanOf,
} from "./timeline";

describe("flight timeline", () => {
  it("covers 0–1 with contiguous, non-overlapping segments", () => {
    expect(OPENING_RANGE[0]).toBe(0);
    let cursor = OPENING_RANGE[1];
    for (const chapter of CHAPTER_NUMBERS) {
      const [start, end] = CHAPTER_RANGES[chapter];
      expect(start).toBe(cursor);
      expect(end).toBeGreaterThan(start);
      cursor = end;
    }
    expect(cursor).toBe(1);
  });

  it("matches the timeline in the brief", () => {
    expect(CHAPTER_RANGES).toEqual({
      1: [0.08, 0.22],
      2: [0.22, 0.38],
      3: [0.38, 0.51],
      4: [0.51, 0.65],
      5: [0.65, 0.84],
      6: [0.84, 1],
    });
  });

  it("has spans that sum to the whole flight", () => {
    const total = spanOf(0) + CHAPTER_NUMBERS.reduce((sum, n) => sum + spanOf(n), 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it("maps progress to the right segment, with boundaries owned by the later one", () => {
    expect(segmentAt(0)).toBe(0);
    expect(segmentAt(0.0799)).toBe(0);
    expect(segmentAt(0.08)).toBe(1);
    expect(segmentAt(0.22)).toBe(2);
    expect(segmentAt(0.5)).toBe(3);
    expect(segmentAt(0.51)).toBe(4);
    expect(segmentAt(0.7)).toBe(5);
    expect(segmentAt(0.84)).toBe(6);
    expect(segmentAt(1)).toBe(6);
  });

  it("clamps out-of-range and invalid progress", () => {
    expect(segmentAt(-1)).toBe(0);
    expect(segmentAt(4)).toBe(6);
    expect(segmentAt(Number.NaN)).toBe(0);
    expect(localProgress(2, 3)).toBe(1);
    expect(localProgress(-2, 3)).toBe(0);
  });

  it("round-trips between local and global progress", () => {
    for (const chapter of CHAPTER_NUMBERS) {
      for (const local of [0, 0.25, 0.5, 1]) {
        expect(localProgress(globalProgress(local, chapter), chapter)).toBeCloseTo(local, 10);
      }
    }
  });

  it("produces stable anchor ids", () => {
    expect(segmentId(0)).toBe("takeoff");
    expect(segmentId(1)).toBe("chapter-01");
    expect(segmentId(6)).toBe("chapter-06");
  });
});
