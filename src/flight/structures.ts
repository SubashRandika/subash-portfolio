/**
 * Where the man-made structures stand: the airport buildings, the industrial
 * works and yards, and the city's buildings and bridges.
 *
 * Placement follows the same land-use rules the terrain shader draws (city
 * blocks and parks, industrial plots), so a building always stands on a
 * paved plot, never in a park, a street or a river. Everything is a pure
 * function of fixed seeds: the same world every visit.
 */

import { routeLateral } from "./path";
import {
  CITY_GRID,
  INDUSTRIAL_PLOT,
  PARK_SHARE,
  REGION_BLEND,
  REGION_BOUNDARIES,
  canalLine,
  cityRiver,
  createTerrainSample,
  downtown,
  fromCityGrid,
  hash2,
  industrialPlot,
  routeLateralAt,
  sampleTerrain,
  toCityGrid,
  urbanDensity,
} from "./terrain";

/** Surface treatment drawn by the structure shader. */
export const STRUCTURE_KINDS = {
  tower: 0,
  office: 1,
  industrial: 2,
  terminal: 3,
  tank: 4,
  containers: 5,
  bridge: 6,
  stack: 7,
} as const;

export type StructureKind = keyof typeof STRUCTURE_KINDS;
export type StructureShape = "box" | "cylinder";

export interface Structure {
  kind: StructureKind;
  shape: StructureShape;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Elevation of the base. */
  y: number;
  /** Size along the local X axis (diameter for cylinders). */
  width: number;
  height: number;
  /** Size along the local Z axis. */
  depth: number;
  /** Rotation about +Y, radians. */
  rotation: number;
  /** 0–1, varies colour and detail. */
  seed: number;
}

const ground = createTerrainSample();

/** Base elevation for a structure, sunk slightly so it never floats. */
function baseAt(x: number, z: number): number {
  return sampleTerrain(x, z, ground).height - 0.6;
}

function onWater(x: number, z: number): boolean {
  return sampleTerrain(x, z, ground).water > 0.01;
}

/** Deterministic random numbers for one plot or block. */
function randomFor(a: number, b: number): (k: number) => number {
  return (k) => hash2(a * 7 + k * 101, b * 13 - k * 37);
}

const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------

const CITY_FROM = REGION_BOUNDARIES[3]! - REGION_BLEND / 2;
const CITY_TO = REGION_BOUNDARIES[4]! + REGION_BLEND / 2;

/** Blocks are built up near the route or in the business district; elsewhere are suburbs. */
export function isBuiltBlock(centreX: number, centreZ: number): boolean {
  const core = downtown(centreX, centreZ);
  return core >= 0.03 || Math.abs(routeLateralAt(centreX, centreZ) - 300) <= 2_200;
}

export function cityStructures(): Structure[] {
  const out: Structure[] = [];
  const { block } = CITY_GRID;

  // Grid cells covering the city's stretch of route.
  const corners: [number, number][] = [];
  for (const d of [CITY_FROM, CITY_TO]) {
    for (const side of [-6_000, 6_000]) corners.push(toCityGrid(routeLateral(d) + side, -d));
  }
  const us = corners.map((c) => c[0]);
  const vs = corners.map((c) => c[1]);
  const u0 = Math.floor(Math.min(...us) / block);
  const u1 = Math.ceil(Math.max(...us) / block);
  const v0 = Math.floor(Math.min(...vs) / block);
  const v1 = Math.ceil(Math.max(...vs) / block);

  for (let bu = u0; bu <= u1; bu++) {
    for (let bv = v0; bv <= v1; bv++) {
      const [cx, cz] = fromCityGrid((bu + 0.5) * block, (bv + 0.5) * block);
      const density = urbanDensity(cx, cz);
      if (density < 0.45) continue;
      if (hash2(bu + 55, bv) < PARK_SHARE) continue;
      if (!isBuiltBlock(cx, cz)) continue;

      const streetU = mod(bu, CITY_GRID.avenueEvery) === 0 ? CITY_GRID.avenue : CITY_GRID.street;
      const streetV = mod(bv, CITY_GRID.avenueEvery) === 0 ? CITY_GRID.avenue : CITY_GRID.street;
      const minU = bu * block + streetU + 5;
      const minV = bv * block + streetV + 5;
      const sizeU = block - streetU - 10;
      const sizeV = block - streetV - 10;
      const core = downtown(cx, cz);
      const random = randomFor(bu, bv);

      // Towers take a whole block in the core; elsewhere blocks hold up to four buildings.
      const split = core > 0.35 ? 1 : 2;
      const lotU = sizeU / split;
      const lotV = sizeV / split;
      for (let i = 0; i < split; i++) {
        for (let j = 0; j < split; j++) {
          const k = i * 2 + j;
          if (split > 1 && random(k) < 0.12) continue; // the odd empty lot
          const fillU = 0.62 + 0.3 * random(k + 10);
          const fillV = 0.62 + 0.3 * random(k + 20);
          const u = minU + (i + 0.5) * lotU;
          const v = minV + (j + 0.5) * lotV;
          const [x, z] = fromCityGrid(u, v);
          const distance = -z;
          if (Math.abs(routeLateralAt(x, z) - cityRiver(distance)) < 125) continue;
          if (onWater(x, z)) continue;

          const r = random(k + 30);
          const height =
            core > 0.12
              ? 36 + core * 255 * (0.4 + 0.6 * r)
              : 10 + 24 * r * (0.55 + 0.45 * density);
          out.push({
            kind: height > 70 ? "tower" : "office",
            shape: "box",
            x,
            z,
            y: baseAt(x, z),
            width: lotU * fillU,
            depth: lotV * fillV,
            height,
            rotation: CITY_GRID.angle,
            seed: random(k + 40),
          });
        }
      }
    }
  }

  // Bridges carry the avenues across the river.
  for (let d = CITY_FROM + 400; d < CITY_TO - 400; d += 640) {
    const lateral = cityRiver(d);
    const x = routeLateral(d) + lateral;
    const z = -d;
    if (urbanDensity(x, z) < 0.3) continue;
    const ahead = routeLateral(d + 5) + cityRiver(d + 5);
    const behind = routeLateral(d - 5) + cityRiver(d - 5);
    const slope = (ahead - behind) / 10;
    // Across the river: perpendicular to its course (dx/dd, -1).
    const length = Math.hypot(1, slope);
    const ux = 1 / length;
    const uz = slope / length;
    out.push({
      kind: "bridge",
      shape: "box",
      x,
      z,
      y: 9,
      width: 300,
      depth: 22,
      height: 2.6,
      rotation: Math.atan2(-uz, ux),
      seed: hash2(Math.round(d), 3),
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Industrial plain
// ---------------------------------------------------------------------------

const INDUSTRY_FROM = REGION_BOUNDARIES[1]! - REGION_BLEND / 2;
const INDUSTRY_TO = REGION_BOUNDARIES[2]! + REGION_BLEND / 2;

export function industrialStructures(): Structure[] {
  const out: Structure[] = [];
  const P = INDUSTRIAL_PLOT;
  const iz0 = Math.floor(-INDUSTRY_TO / P);
  const iz1 = Math.ceil(-INDUSTRY_FROM / P);
  const ix0 = Math.floor(-5_200 / P);
  const ix1 = Math.ceil(5_200 / P);

  const add = (structure: Omit<Structure, "y">) => {
    const distance = -structure.z;
    const lateral = routeLateralAt(structure.x, structure.z);
    if (Math.abs(lateral - canalLine(distance)) < 70) return;
    if (onWater(structure.x, structure.z)) return;
    out.push({ ...structure, y: baseAt(structure.x, structure.z) });
  };

  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const use = industrialPlot(ix, iz);
      if (use === 0) continue;
      const random = randomFor(ix + 5_000, iz + 9_000);
      const x0 = ix * P + 22;
      const z0 = iz * P + 22;
      const span = P - 44;
      const turned = random(1) < 0.5;

      if (use === 1) {
        // Works: a production hall, offices, chimneys and storage tanks.
        const w = 90 + 80 * random(2);
        const d = 50 + 40 * random(3);
        add({
          kind: "industrial",
          shape: "box",
          x: x0 + span * 0.32,
          z: z0 + span * 0.3,
          width: turned ? d : w,
          depth: turned ? w : d,
          height: 14 + 10 * random(4),
          rotation: 0,
          seed: random(5),
        });
        add({
          kind: "office",
          shape: "box",
          x: x0 + span * 0.82,
          z: z0 + span * 0.18,
          width: 26 + 16 * random(6),
          depth: 20 + 12 * random(7),
          height: 9 + 6 * random(8),
          rotation: 0,
          seed: random(9),
        });
        if (random(10) > 0.35) {
          const stacks = random(11) > 0.6 ? 2 : 1;
          for (let s = 0; s < stacks; s++) {
            const radius = 3 + 1.5 * random(12 + s);
            add({
              kind: "stack",
              shape: "cylinder",
              x: x0 + span * (0.7 + 0.12 * s),
              z: z0 + span * 0.45,
              width: radius * 2,
              depth: radius * 2,
              height: 45 + 40 * random(14 + s),
              rotation: 0,
              seed: random(16 + s),
            });
          }
        }
        if (random(18) > 0.45) {
          const tanks = 2 + Math.floor(random(19) * 4);
          const radius = 7 + 6 * random(20);
          for (let t = 0; t < tanks; t++) {
            add({
              kind: "tank",
              shape: "cylinder",
              x: x0 + span * 0.12 + t * (radius * 2 + 6),
              z: z0 + span * 0.82,
              width: radius * 2,
              depth: radius * 2,
              height: 9 + 7 * random(21),
              rotation: 0,
              seed: random(22 + t),
            });
          }
        }
      } else if (use === 2) {
        // Logistics yard: a warehouse and rows of stacked containers.
        add({
          kind: "industrial",
          shape: "box",
          x: x0 + span * 0.5,
          z: z0 + span * 0.2,
          width: 170,
          depth: 64,
          height: 12 + 3 * random(2),
          rotation: 0,
          seed: random(3),
        });
        const rows = 4 + Math.floor(random(4) * 4);
        for (let r = 0; r < rows; r++) {
          const length = 12.2 * (4 + Math.floor(random(5 + r) * 5));
          add({
            kind: "containers",
            shape: "box",
            x: x0 + 20 + length / 2 + random(15 + r) * (span - length - 40),
            z: z0 + span * 0.48 + r * 11,
            width: length,
            depth: 4.9,
            height: 2.6 * (1 + Math.floor(random(25 + r) * 3)),
            rotation: 0,
            seed: random(35 + r),
          });
        }
      } else {
        // Warehouses: long, low sheds side by side.
        const sheds = 2 + Math.floor(random(2) * 2);
        for (let s = 0; s < sheds; s++) {
          add({
            kind: "industrial",
            shape: "box",
            x: x0 + span * 0.5,
            z: z0 + 40 + s * (span / sheds),
            width: 170 + 30 * random(3 + s),
            depth: 54,
            height: 11 + 4 * random(6 + s),
            rotation: 0,
            seed: random(9 + s),
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Airport
// ---------------------------------------------------------------------------

/** Terminal, control tower and hangars beside the apron (see the terrain shader). */
export function airportStructures(): Structure[] {
  const at = (structure: Omit<Structure, "y">, y = -0.2): Structure => ({ ...structure, y });
  return [
    at({
      kind: "terminal",
      shape: "box",
      x: 600,
      z: -1_425,
      width: 70,
      depth: 480,
      height: 17,
      rotation: 0,
      seed: 0.3,
    }),
    at({ kind: "stack", shape: "cylinder", x: 640, z: -1_080, width: 9, depth: 9, height: 36, rotation: 0, seed: 0.9 }),
    // Control tower cab, on top of its shaft.
    at({ kind: "terminal", shape: "box", x: 640, z: -1_080, width: 13, depth: 13, height: 5, rotation: 0, seed: 0.7 }, 36),
    at({ kind: "industrial", shape: "box", x: 300, z: -2_050, width: 86, depth: 72, height: 22, rotation: 0, seed: 0.2 }),
    at({ kind: "industrial", shape: "box", x: 300, z: -2_180, width: 86, depth: 72, height: 22, rotation: 0, seed: 0.6 }),
    at({ kind: "industrial", shape: "box", x: 420, z: -2_115, width: 60, depth: 50, height: 15, rotation: 0, seed: 0.45 }),
  ];
}
