import { afterEach, describe, expect, it } from "vitest";
import {
  GOVERNOR,
  QUALITY,
  createGovernor,
  getQuality,
  initialTier,
  recordFrame,
  resetQuality,
  setQualityTier,
  subscribeQuality,
  tierOverride,
} from "./quality";

const desktop = { software: false, coarsePointer: false, shortSide: 900, deviceMemory: 8, cores: 8 };

function run(tier: "high" | "medium" | "low", frameMs: number, frames: number) {
  const governor = createGovernor(tier);
  const changes: string[] = [];
  for (let i = 0; i < frames; i++) {
    const next = recordFrame(governor, frameMs);
    if (next) changes.push(next);
  }
  return { governor, changes };
}

afterEach(() => resetQuality());

describe("graphics profiles", () => {
  it("get lighter from high to low", () => {
    expect(QUALITY.high.shadows).toBe(true);
    expect(QUALITY.medium.shadows).toBe(false);
    expect(QUALITY.high.maxPixelRatio).toBeGreaterThan(QUALITY.medium.maxPixelRatio);
    expect(QUALITY.medium.maxPixelRatio).toBeGreaterThan(QUALITY.low.maxPixelRatio);
    expect(QUALITY.high.terrainDetail).toBeGreaterThan(QUALITY.low.terrainDetail);
    expect(QUALITY.low.glows).toBe(false);
  });

  it("start a desktop with a GPU on high", () => {
    expect(initialTier(desktop)).toBe("high");
  });

  it("start phones and small or modest devices on medium", () => {
    expect(initialTier({ ...desktop, coarsePointer: true })).toBe("medium");
    expect(initialTier({ ...desktop, shortSide: 390 })).toBe("medium");
    expect(initialTier({ ...desktop, deviceMemory: 4 })).toBe("medium");
    expect(initialTier({ ...desktop, cores: 4 })).toBe("medium");
  });

  it("start software rendering, save-data and very small devices on low", () => {
    expect(initialTier({ ...desktop, software: true })).toBe("low");
    expect(initialTier({ ...desktop, saveData: true })).toBe("low");
    expect(initialTier({ ...desktop, deviceMemory: 2 })).toBe("low");
  });

  it("assume a capable device where the browser does not say", () => {
    expect(initialTier({ software: false, coarsePointer: false, shortSide: 900 })).toBe("high");
  });

  it("can be forced with ?quality=", () => {
    expect(tierOverride("?quality=low")).toBe("low");
    expect(tierOverride("?flight=live&quality=medium")).toBe("medium");
    expect(tierOverride("?quality=ultra")).toBeNull();
    expect(tierOverride("")).toBeNull();
  });
});

describe("quality governor", () => {
  it("keeps the profile on a device that holds 60 fps", () => {
    expect(run("high", 16.7, 3_000).changes).toEqual([]);
  });

  it("steps down one level at a time on a device that cannot keep up, after settling", () => {
    const { changes } = run("high", 33.4, 3_000);
    expect(changes).toEqual(["medium", "low"]);
    // The first step waits for the warm-up and one full window.
    const first = createGovernor("high");
    let at = -1;
    for (let i = 0; i < 1_000 && at < 0; i++) if (recordFrame(first, 33.4)) at = i;
    expect(at).toBe(GOVERNOR.warmUp + GOVERNOR.window - 1);
  });

  it("never goes below low or back up", () => {
    const { governor, changes } = run("low", 50, 3_000);
    expect(changes).toEqual([]);
    expect(governor.tier).toBe("low");
  });

  it("ignores pauses such as a hidden tab", () => {
    expect(run("high", 400, 3_000).changes).toEqual([]);
  });
});

describe("current settings", () => {
  it("notify subscribers when the profile changes, and only then", () => {
    const seen: string[] = [];
    subscribeQuality((settings) => seen.push(settings.tier));
    setQualityTier("high");
    setQualityTier("medium");
    setQualityTier("medium");
    expect(seen).toEqual(["medium"]);
    expect(getQuality()).toBe(QUALITY.medium);
  });
});
