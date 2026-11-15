import { describe, expect, it } from "vitest";
import { atmosphereAt, createAtmosphere, hex, lookNameAt } from "./atmosphere";

const samples = Array.from({ length: 1001 }, (_, i) => i / 1000);

describe("atmosphere", () => {
  it("converts hex colours to linear RGB", () => {
    expect(hex("#000000")).toEqual([0, 0, 0]);
    expect(hex("#ffffff")).toEqual([1, 1, 1]);
    const [r] = hex("#808080");
    expect(r).toBeCloseTo(0.2159, 3);
    expect(() => hex("red")).toThrow(/#rrggbb/);
  });

  it("opens before dawn: sun below the horizon, stars out, lamps bright", () => {
    const a = atmosphereAt(0, createAtmosphere());
    expect(a.sunElevation).toBeLessThan(0);
    expect(a.stars).toBeGreaterThan(0.5);
    expect(a.lamps).toBe(1);
    expect(lookNameAt(0)).toBe("pre-dawn");
  });

  it("reaches full daylight mid-flight and a low sun at the end", () => {
    const day = atmosphereAt(0.5, createAtmosphere());
    expect(day.sunElevation).toBeGreaterThan(30);
    expect(day.stars).toBe(0);
    const end = atmosphereAt(1, createAtmosphere());
    expect(end.sunElevation).toBeGreaterThan(0);
    expect(end.sunElevation).toBeLessThan(12);
    expect(lookNameAt(1)).toBe("sunrise horizon");
  });

  it("always yields a unit sun direction and valid values", () => {
    const a = createAtmosphere();
    for (const p of samples) {
      atmosphereAt(p, a);
      expect(Math.hypot(...a.sunDirection)).toBeCloseTo(1, 6);
      expect(a.fogDensity).toBeGreaterThan(0);
      expect(a.exposure).toBeGreaterThan(0.5);
      for (const colour of [a.zenith, a.horizon, a.fogColor, a.sunColor, a.ambientSky]) {
        for (const channel of colour) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1.0001);
        }
      }
    }
  });

  it("changes gradually, with no jumps in light between frames", () => {
    const a = createAtmosphere();
    const b = createAtmosphere();
    for (let i = 1; i < samples.length; i++) {
      atmosphereAt(samples[i - 1]!, a);
      atmosphereAt(samples[i]!, b);
      expect(Math.abs(b.sunElevation - a.sunElevation)).toBeLessThan(0.6);
      expect(Math.abs(b.sunIntensity - a.sunIntensity)).toBeLessThan(0.08);
      expect(Math.abs(b.exposure - a.exposure)).toBeLessThan(0.02);
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(b.horizon[c]! - a.horizon[c]!)).toBeLessThan(0.03);
      }
    }
  });

  it("is a pure function of progress", () => {
    const first = structuredClone(atmosphereAt(0.37, createAtmosphere()));
    const scratch = createAtmosphere();
    atmosphereAt(0.92, scratch);
    expect(structuredClone(atmosphereAt(0.37, scratch))).toEqual(first);
  });
});
