import { describe, expect, it } from "vitest";
import { createFlightPose, flightPose } from "./path";
import { cameraPose, createCameraPose } from "./shots";
import {
  type Structure,
  airportStructures,
  cityStructures,
  industrialStructures,
} from "./structures";
import { createTerrainSample, sampleTerrain } from "./terrain";

const city = cityStructures();
const industry = industrialStructures();
const airport = airportStructures();
const all = [...city, ...industry, ...airport];

/** Horizontal distance from a point to a structure's footprint (rotated rectangle). */
function distanceTo(structure: Structure, x: number, z: number): number {
  const dx = x - structure.x;
  const dz = z - structure.z;
  const c = Math.cos(structure.rotation);
  const s = Math.sin(structure.rotation);
  // Into the structure's local frame (inverse of rotation about +Y).
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const ox = Math.max(Math.abs(lx) - structure.width / 2, 0);
  const oz = Math.max(Math.abs(lz) - structure.depth / 2, 0);
  return Math.hypot(ox, oz);
}

describe("structures", () => {
  it("builds a city, an industrial region and an airport", () => {
    expect(city.filter((s) => s.kind === "tower").length).toBeGreaterThan(40);
    expect(city.filter((s) => s.kind === "office").length).toBeGreaterThan(400);
    expect(city.filter((s) => s.kind === "residential").length).toBeGreaterThan(400);
    // Buildings have roofs and rooftop plant, not just walls.
    expect(city.filter((s) => s.kind === "roof").length).toBeGreaterThan(200);
    expect(city.filter((s) => s.kind === "plant").length).toBeGreaterThan(1_000);
    expect(industry.some((s) => s.kind === "tank" && s.shape !== "cylinder")).toBe(true);
    expect(city.some((s) => s.shape === "arch")).toBe(true);
    expect(city.filter((s) => s.kind === "bridge").length).toBeGreaterThan(5);
    expect(industry.length).toBeGreaterThan(150);
    expect(industry.some((s) => s.kind === "stack")).toBe(true);
    expect(industry.some((s) => s.kind === "containers")).toBe(true);
    expect(airport.length).toBeGreaterThan(3);
    // Parts, not buildings: each is one instance of one of ten unit solids,
    // so the whole set is still a handful of draw calls.
    expect(all.length).toBeLessThan(45_000);
  });

  it("is the same world every time", () => {
    expect(cityStructures().slice(0, 50)).toEqual(city.slice(0, 50));
    expect(industrialStructures().slice(-50)).toEqual(industry.slice(-50));
  });

  it("never stands a building in water", () => {
    const sample = createTerrainSample();
    for (const s of all.filter((item) => !item.span)) {
      sampleTerrain(s.x, s.z, sample);
      expect(sample.water, `${s.kind} at ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`).toBeLessThan(0.01);
    }
  });

  it("keeps sensible sizes", () => {
    for (const s of all) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.depth).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
      expect(s.height).toBeLessThan(300);
    }
  });

  it("leaves the aircraft and camera clear of every structure", () => {
    const pose = createFlightPose();
    const camera = createCameraPose();
    const tall = all.filter((s) => s.y + s.height > 5);
    for (let i = 0; i <= 1_000; i++) {
      const p = i / 1_000;
      flightPose(p, pose);
      cameraPose(p, pose, camera);
      for (const s of tall) {
        const top = s.y + s.height;
        if (distanceTo(s, pose.x, pose.z) < 60) {
          expect(pose.y - top, `aircraft over ${s.kind} at ${p}`).toBeGreaterThan(100);
        }
        if (distanceTo(s, camera.px, camera.pz) < 30) {
          expect(camera.py - top, `camera over ${s.kind} at ${p}`).toBeGreaterThan(30);
        }
      }
    }
  });
});
