import { describe, expect, it } from "vitest";
import { createFlightPose, flightPose, routeDistance, routeLateral } from "./path";
import { cameraPose, createCameraPose } from "./shots";
import {
  REGION_BOUNDARIES,
  REGION_COUNT,
  REGION_NAMES,
  canalLine,
  cityRiver,
  coastline,
  createTerrainSample,
  fbm,
  hash2,
  regionAt,
  regionWeights,
  ridged,
  sampleTerrain,
  terrainHeight,
  valleyRiver,
  valueNoise,
} from "./terrain";
import { CHAPTER_RANGES } from "./timeline";

const midChapter = (n: 1 | 2 | 3 | 4 | 5 | 6) =>
  routeDistance((CHAPTER_RANGES[n][0] + CHAPTER_RANGES[n][1]) / 2);

describe("terrain noise", () => {
  it("hashes deterministically into [0, 1)", () => {
    const values = [];
    for (let i = -50; i < 50; i++) {
      const h = hash2(i * 37, -i * 11);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(hash2(i * 37, -i * 11)).toBe(h);
      values.push(h);
    }
    // Not degenerate.
    expect(new Set(values).size).toBeGreaterThan(95);
  });

  it("is continuous", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.731 - 40;
      const y = i * 0.377 + 12;
      expect(Math.abs(valueNoise(x, y) - valueNoise(x + 1e-4, y))).toBeLessThan(1e-3);
    }
  });

  it("keeps fractal noise within [0, 1]", () => {
    for (let i = 0; i < 300; i++) {
      const x = i * 3.17 - 400;
      const y = i * -1.91 + 200;
      for (const value of [fbm(x, y, 5), ridged(x, y, 5)]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("regions", () => {
  it("weights always sum to one", () => {
    const w: number[] = [];
    for (let d = -5_000; d < 60_000; d += 137) {
      regionWeights(d, w);
      expect(w).toHaveLength(REGION_COUNT);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      for (const value of w) expect(value).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("hands over at the chapter boundaries", () => {
    expect(REGION_BOUNDARIES).toHaveLength(5);
    const expected = [1, 2, 3, 4, 5, 6] as const;
    expected.forEach((chapter, index) => {
      expect(regionAt(midChapter(chapter))).toBe(REGION_NAMES[index]);
    });
  });
});

describe("terrain", () => {
  it("keeps the airfield flat at sea level", () => {
    for (let z = 700; z > -3_000; z -= 97) {
      for (const x of [-300, -60, 0, 60, 300, 600]) {
        expect(terrainHeight(x, z)).toBeCloseTo(0, 6);
      }
    }
  });

  it("is continuous across region boundaries", () => {
    for (const boundary of REGION_BOUNDARIES) {
      for (let d = boundary - 2_000; d < boundary + 2_000; d += 10) {
        const x = routeLateral(d) + 400;
        const step = Math.abs(terrainHeight(x, -d) - terrainHeight(x, -d - 10));
        expect(step).toBeLessThan(40);
      }
    }
  });

  it("puts sea beside the coast and rivers where the shading draws them", () => {
    const sample = createTerrainSample();
    const d = midChapter(1);
    sampleTerrain(coastline(d) - 800, -d, sample);
    expect(sample.water).toBeGreaterThan(0.99);
    expect(sample.height).toBe(0);

    const valley = midChapter(2);
    sampleTerrain(routeLateral(valley) + valleyRiver(valley), -valley, sample);
    expect(sample.water).toBeGreaterThan(0.99);

    const plain = midChapter(3);
    sampleTerrain(routeLateral(plain) + canalLine(plain), -plain, sample);
    expect(sample.water).toBeGreaterThan(0.99);

    const city = midChapter(5);
    sampleTerrain(routeLateral(city) + cityRiver(city), -city, sample);
    expect(sample.water).toBeGreaterThan(0.99);
  });

  it("raises mountains on both sides of the valley", () => {
    const d = midChapter(2);
    const centre = routeLateral(d) + valleyRiver(d);
    const floor = terrainHeight(centre, -d);
    let left = 0;
    let right = 0;
    for (let offset = 2_000; offset <= 5_000; offset += 250) {
      left = Math.max(left, terrainHeight(centre - offset, -d));
      right = Math.max(right, terrainHeight(centre + offset, -d));
    }
    expect(floor).toBeLessThan(120);
    expect(left).toBeGreaterThan(700);
    expect(right).toBeGreaterThan(700);
  });
});

describe("clearance", () => {
  const pose = createFlightPose();
  const camera = createCameraPose();
  const samples = Array.from({ length: 1_001 }, (_, i) => i / 1_000);

  it("keeps the aircraft well above the ground once climbing out", () => {
    for (const p of samples.filter((s) => s >= 0.1)) {
      flightPose(p, pose);
      let highest = 0;
      for (const offset of [-80, -40, 0, 40, 80]) {
        highest = Math.max(highest, terrainHeight(pose.x + offset, pose.z));
      }
      expect(pose.y - highest, `aircraft clearance at ${p}`).toBeGreaterThan(150);
    }
  });

  it("keeps the camera above the ground for the whole flight, in any frame shape", () => {
    for (const portrait of [0, 1]) {
      for (const p of samples.filter((s) => s >= 0.085)) {
        flightPose(p, pose);
        cameraPose(p, pose, camera, 0, portrait);
        const ground = terrainHeight(camera.px, camera.pz);
        expect(camera.py - ground, `camera clearance at ${p} (portrait ${portrait})`).toBeGreaterThan(40);
      }
    }
  });
});
