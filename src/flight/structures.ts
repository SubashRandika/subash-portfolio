/**
 * Where the man-made structures stand: the airport buildings, the industrial
 * works and yards, and the city's buildings and bridges.
 *
 * Every building is assembled from a handful of simple solids (a podium, a
 * shaft, setbacks, a roof, rooftop plant), which is what gives it a
 * silhouette instead of a box. Placement follows the same land-use rules the
 * terrain shader draws (city blocks and parks, industrial plots), so a
 * building always stands on a paved plot, never in a park, a street or a
 * river. Everything is a pure function of fixed seeds: the same world every
 * visit.
 */

import { routeLateral } from "./path";
import {
  CITY_BLOCK_TYPES,
  CITY_GRID,
  INDUSTRIAL_PLOT,
  PARK_SHARE,
  REGION_BLEND,
  REGION_BOUNDARIES,
  canalLine,
  cityBlockType,
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
  /** Glazed curtain wall. */
  tower: 0,
  /** Masonry or concrete with punched windows. */
  office: 1,
  /** Profiled metal cladding. */
  industrial: 2,
  /** Airport buildings: tall glazing under a deep fascia. */
  terminal: 3,
  /** Storage tank shells and their roofs. */
  tank: 4,
  /** A row of stacked shipping containers. */
  containers: 5,
  /** Bridge deck and parapets. */
  bridge: 6,
  /** Chimneys, with aviation markings near the top. */
  stack: 7,
  /** Apartment blocks with balconies. */
  residential: 8,
  /** Pitched roofs in tile or slate. */
  roof: 9,
  /** Pitched roofs in standing-seam metal, with rooflights. */
  metalRoof: 10,
  /** Rooftop plant: air handlers, lift overruns, stair heads. */
  plant: 11,
  /** Bare concrete: piers, bund walls, silos, cooling towers. */
  concrete: 12,
  /** Painted steel: cranes, arch ribs, pipe racks, masts. */
  steel: 13,
} as const;

export type StructureKind = keyof typeof STRUCTURE_KINDS;

/** Unit solids the renderer instances. All stand on their base, centred. */
export const STRUCTURE_SHAPES = {
  box: 0,
  cylinder: 1,
  /** Triangular prism, ridge along the local Z axis. */
  gable: 2,
  /** Four-sided pyramid. */
  pyramid: 3,
  /** Half an ellipsoid. */
  dome: 4,
  sphere: 5,
  cone: 6,
  /** Cylinder narrowing to 60 % of its base width. */
  taper: 7,
  /** Hyperboloid shell of a cooling tower. */
  cooling: 8,
  /** Semi-elliptical arch rib spanning the local X axis. */
  arch: 9,
} as const;

export type StructureShape = keyof typeof STRUCTURE_SHAPES;

export interface Structure {
  kind: StructureKind;
  shape: StructureShape;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Elevation of the base. */
  y: number;
  /** Size along the local X axis (diameter for round shapes). */
  width: number;
  height: number;
  /** Size along the local Z axis. */
  depth: number;
  /** Rotation about +Y, radians. */
  rotation: number;
  /** 0–1, varies colour and detail. */
  seed: number;
  /** True for parts that are meant to stand in or over water (bridges). */
  span?: boolean;
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
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/**
 * A place to build: an origin, a heading and a base elevation. Parts are
 * given in metres in the site's own frame, so a building can be described
 * once and stood anywhere.
 */
interface Site {
  /**
   * Adds one solid.
   * @param lx, lz  centre of its footprint in the site frame
   * @param y0      height of its base above the site's ground
   * @param turn    extra rotation about +Y, radians
   */
  part(
    kind: StructureKind,
    shape: StructureShape,
    lx: number,
    lz: number,
    y0: number,
    width: number,
    height: number,
    depth: number,
    seed: number,
    turn?: number,
  ): void;
  /** World position of a point in the site frame. */
  world(lx: number, lz: number): [number, number];
}

function createSite(
  out: Structure[],
  x: number,
  z: number,
  rotation: number,
  base: number,
  span = false,
): Site {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const world = (lx: number, lz: number): [number, number] => [x + c * lx + s * lz, z - s * lx + c * lz];
  return {
    world,
    part(kind, shape, lx, lz, y0, width, height, depth, seed, turn = 0) {
      const [wx, wz] = world(lx, lz);
      const structure: Structure = {
        kind,
        shape,
        x: wx,
        z: wz,
        y: base + y0,
        width,
        height,
        depth,
        rotation: rotation + turn,
        seed,
      };
      if (span) structure.span = true;
      out.push(structure);
    },
  };
}

const QUARTER = Math.PI / 2;

/** A pitched roof over a rectangle, ridge along its longer side. */
function pitchedRoof(
  site: Site,
  kind: "roof" | "metalRoof",
  lx: number,
  lz: number,
  y0: number,
  width: number,
  depth: number,
  rise: number,
  seed: number,
): void {
  const overhang = 0.9;
  if (depth >= width) {
    site.part(kind, "gable", lx, lz, y0, width + overhang, rise, depth + overhang, seed);
  } else {
    site.part(kind, "gable", lx, lz, y0, depth + overhang, rise, width + overhang, seed, QUARTER);
  }
}

/** Lift overruns, stair heads and air handlers on a flat roof. */
function roofPlant(
  site: Site,
  lx: number,
  lz: number,
  top: number,
  width: number,
  depth: number,
  random: (k: number) => number,
  k: number,
): void {
  const area = width * depth;
  const count = area > 1_600 ? 3 : area > 500 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const w = clamp(width * (0.14 + 0.2 * random(k + i * 3)), 2.6, 16);
    const d = clamp(depth * (0.14 + 0.2 * random(k + i * 3 + 1)), 2.6, 16);
    const h = 2.2 + 2.8 * random(k + i * 3 + 2);
    const ox = (random(k + i * 5 + 40) - 0.5) * Math.max(width - w - 4, 0);
    const oz = (random(k + i * 5 + 41) - 0.5) * Math.max(depth - d - 4, 0);
    site.part("plant", "box", lx + ox, lz + oz, top, w, h, d, random(k + i * 5 + 42));
  }
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------

const CITY_FROM = REGION_BOUNDARIES[3]! - REGION_BLEND / 2;
const CITY_TO = REGION_BOUNDARIES[4]! + REGION_BLEND / 2;

/** Storey height used to turn floor counts into metres. */
const STOREY = 3.3;
/** Pavement between the kerb and the building line. */
const SIDEWALK = 5;

/** Blocks are built up near the route or in the business district; elsewhere are suburbs. */
export function isBuiltBlock(centreX: number, centreZ: number): boolean {
  const core = downtown(centreX, centreZ);
  return core >= 0.03 || Math.abs(routeLateralAt(centreX, centreZ) - 300) <= 2_200;
}

/** May a building stand at this world point of the city? */
function cityClear(x: number, z: number): boolean {
  if (Math.abs(routeLateralAt(x, z) - cityRiver(-z)) < 125) return false;
  return !onWater(x, z);
}

/** A high-rise: podium, shaft with setbacks, and a crown. */
function tower(
  site: Site,
  lx: number,
  lz: number,
  width: number,
  depth: number,
  height: number,
  random: (k: number) => number,
  k: number,
): void {
  const glazed = random(k) < 0.72;
  const kind: StructureKind = glazed ? "tower" : random(k + 1) < 0.5 ? "office" : "residential";
  const seed = random(k + 2);
  const podium = height > 60 ? 9 + 12 * random(k + 3) : 0;
  if (podium > 0) {
    site.part("office", "box", lx, lz, 0, width, podium, depth, random(k + 4));
    roofPlant(site, lx, lz, podium, width, depth, random, k + 60);
  }

  let w = width * (podium > 0 ? 0.58 + 0.2 * random(k + 5) : 1);
  let d = depth * (podium > 0 ? 0.58 + 0.2 * random(k + 6) : 1);
  const tiers = height > 150 ? [0.62, 0.85, 1] : height > 85 ? [0.76, 1] : [1];
  let from = podium;
  for (let t = 0; t < tiers.length; t++) {
    const to = podium + (height - podium) * tiers[t]!;
    site.part(kind, "box", lx, lz, from, w, to - from, d, seed);
    from = to;
    // Each setback steps in on all sides.
    w *= 0.74 + 0.1 * random(k + 10 + t);
    d *= 0.74 + 0.1 * random(k + 20 + t);
  }

  // Crown.
  const topW = w / (0.74 + 0.1 * random(k + 10 + tiers.length - 1));
  const topD = d / (0.74 + 0.1 * random(k + 20 + tiers.length - 1));
  const crown = random(k + 30);
  if (crown < 0.3 && height > 70) {
    const mast = Math.min(height * 0.14, 38);
    site.part("plant", "box", lx, lz, height, topW * 0.5, 4.5, topD * 0.5, random(k + 31));
    site.part("steel", "taper", lx, lz, height + 4.5, 2.2, mast, 2.2, 0.05);
  } else if (crown < 0.5 && height > 70) {
    site.part("metalRoof", "pyramid", lx, lz, height, topW * 0.96, Math.min(topW, topD) * 0.45, topD * 0.96, seed);
  } else {
    site.part("plant", "box", lx, lz, height, topW * 0.62, 3.6 + 3 * random(k + 32), topD * 0.62, random(k + 33));
    if (crown > 0.8) {
      site.part("plant", "cylinder", lx + topW * 0.34, lz - topD * 0.3, height, 4.2, 3.4, 4.2, random(k + 34));
    }
  }
}

/** A mid-rise building on one lot: a main volume, sometimes a wing, and a roof. */
function midRise(
  site: Site,
  lx: number,
  lz: number,
  width: number,
  depth: number,
  height: number,
  random: (k: number) => number,
  k: number,
): void {
  const kind: StructureKind = random(k) < 0.45 ? "residential" : "office";
  const seed = random(k + 1);
  const wing = random(k + 2) < 0.34 && Math.min(width, depth) > 30;
  let mainW = width;
  let mainD = depth;
  let mainX = lx;
  let mainZ = lz;
  if (wing) {
    // An L: the main volume keeps one side of the lot, a lower wing the rest.
    const alongX = random(k + 3) < 0.5;
    const share = 0.52 + 0.14 * random(k + 4);
    const lowH = Math.max(STOREY * 2, height * (0.45 + 0.25 * random(k + 5)));
    if (alongX) {
      mainW = width * share;
      mainX = lx - (width - mainW) / 2;
      const wingW = width - mainW;
      const wingD = depth * (0.5 + 0.2 * random(k + 6));
      const wx = lx + (width - wingW) / 2;
      const wz = lz + (depth - wingD) / 2;
      site.part(kind, "box", wx, wz, 0, wingW, lowH, wingD, seed);
      roofPlant(site, wx, wz, lowH, wingW, wingD, random, k + 70);
    } else {
      mainD = depth * share;
      mainZ = lz - (depth - mainD) / 2;
      const wingD = depth - mainD;
      const wingW = width * (0.5 + 0.2 * random(k + 6));
      const wx = lx + (width - wingW) / 2;
      const wz = lz + (depth - wingD) / 2;
      site.part(kind, "box", wx, wz, 0, wingW, lowH, wingD, seed);
      roofPlant(site, wx, wz, lowH, wingW, wingD, random, k + 70);
    }
  }
  site.part(kind, "box", mainX, mainZ, 0, mainW, height, mainD, seed);
  if (height < STOREY * 6.5 && random(k + 7) < 0.45 && Math.min(mainW, mainD) < 34) {
    pitchedRoof(site, "roof", mainX, mainZ, height, mainW, mainD, Math.min(mainW, mainD) * 0.26, random(k + 8));
  } else {
    roofPlant(site, mainX, mainZ, height, mainW, mainD, random, k + 80);
  }
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
      const sizeU = block - streetU - 2 * SIDEWALK;
      const sizeV = block - streetV - 2 * SIDEWALK;
      // The buildable rectangle, and a site at its centre.
      const [ox, oz] = fromCityGrid(
        bu * block + streetU + SIDEWALK + sizeU / 2,
        bv * block + streetV + SIDEWALK + sizeV / 2,
      );
      const site = createSite(out, ox, oz, CITY_GRID.angle, baseAt(ox, oz));
      const clear = (lx: number, lz: number) => cityClear(...site.world(lx, lz));
      /** Every point of a footprint is on dry land, clear of the river. */
      const clearRect = (lx: number, lz: number, w: number, d: number) => {
        for (const fx of [-0.5, 0, 0.5]) {
          for (const fz of [-0.5, 0, 0.5]) if (!clear(lx + fx * w, lz + fz * d)) return false;
        }
        return true;
      };
      const core = downtown(cx, cz);
      const random = randomFor(bu, bv);

      if (core > 0.35) {
        // The business district: one tower to a block, or a pair.
        if (!clearRect(0, 0, sizeU, sizeV)) continue;
        const height = 36 + core * 255 * (0.4 + 0.6 * random(30));
        if (random(50) < 0.22 && height < 170) {
          const w = sizeU * 0.42;
          tower(site, -sizeU * 0.26, 0, w, sizeV * 0.8, height, random, 100);
          tower(site, sizeU * 0.26, 0, w, sizeV * 0.8, height * (0.7 + 0.25 * random(51)), random, 200);
        } else {
          tower(site, 0, 0, sizeU * 0.9, sizeV * 0.9, height, random, 100);
        }
        continue;
      }

      const lots = (split: number, build: (lx: number, lz: number, w: number, d: number, k: number) => void) => {
        const lotU = sizeU / split;
        const lotV = sizeV / split;
        for (let i = 0; i < split; i++) {
          for (let j = 0; j < split; j++) {
            const k = i * 2 + j;
            if (random(k) < 0.1) continue; // the odd empty lot
            const lx = -sizeU / 2 + (i + 0.5) * lotU;
            const lz = -sizeV / 2 + (j + 0.5) * lotV;
            if (!clearRect(lx, lz, lotU, lotV)) continue;
            build(lx, lz, lotU * (0.66 + 0.26 * random(k + 10)), lotV * (0.66 + 0.26 * random(k + 20)), k);
          }
        }
      };

      if (core > 0.12) {
        // Around the core: high-rises four to a block.
        lots(2, (lx, lz, w, d, k) => {
          const height = 36 + core * 255 * (0.4 + 0.6 * random(k + 30));
          tower(site, lx, lz, w, d, height, random, 100 + k * 100);
        });
        continue;
      }

      const scale = 0.55 + 0.45 * density;
      const type = cityBlockType(bu, bv);
      const whole = clearRect(0, 0, sizeU, sizeV);

      if (type === CITY_BLOCK_TYPES.courtyard && whole) {
        // A perimeter block: four ranges of flats around a courtyard.
        const barDepth = 14 + 4 * random(60);
        const floors = 4 + Math.floor(4 * random(61) * scale);
        const kind: StructureKind = random(62) < 0.6 ? "residential" : "office";
        const seed = random(63);
        const pitched = random(64) < 0.62;
        const open = random(65) < 0.22 ? Math.floor(random(66) * 4) : -1;
        const ranges: [number, number, number, number][] = [
          [0, -sizeV / 2 + barDepth / 2, sizeU, barDepth],
          [0, sizeV / 2 - barDepth / 2, sizeU, barDepth],
          [-sizeU / 2 + barDepth / 2, 0, barDepth, sizeV - 2 * barDepth],
          [sizeU / 2 - barDepth / 2, 0, barDepth, sizeV - 2 * barDepth],
        ];
        ranges.forEach(([lx, lz, w, d], index) => {
          if (index === open) return;
          const height = STOREY * (floors + (random(70 + index) < 0.3 ? 1 : 0));
          site.part(kind, "box", lx, lz, 0, w, height, d, seed);
          if (pitched) pitchedRoof(site, "roof", lx, lz, height, w, d, barDepth * 0.3, seed);
          else roofPlant(site, lx, lz, height, w, d, random, 80 + index * 10);
        });
      } else if (type === CITY_BLOCK_TYPES.slabs && whole) {
        // Apartment slabs standing in open ground.
        const count = 2 + (random(60) < 0.4 ? 1 : 0);
        const alongU = random(61) < 0.5;
        const long = (alongU ? sizeU : sizeV) * 0.84;
        const across = alongU ? sizeV : sizeU;
        const barDepth = 13 + 3 * random(62);
        for (let i = 0; i < count; i++) {
          const offset = -across / 2 + ((i + 0.5) * across) / count;
          const height = STOREY * (8 + Math.floor(8 * random(63 + i) * scale));
          const lx = alongU ? 0 : offset;
          const lz = alongU ? offset : 0;
          const w = alongU ? long : barDepth;
          const d = alongU ? barDepth : long;
          site.part("residential", "box", lx, lz, 0, w, height, d, random(66 + i));
          roofPlant(site, lx, lz, height, w, d, random, 90 + i * 10);
        }
      } else if (type === CITY_BLOCK_TYPES.commercial && whole) {
        // A large low building with its car park (drawn by the terrain shader).
        const w = sizeU * 0.9;
        const d = sizeV * 0.5;
        const lz = -sizeV / 2 + d / 2;
        const height = 8 + 5 * random(60);
        site.part("industrial", "box", 0, lz, 0, w, height, d, random(61));
        roofPlant(site, 0, lz, height, w, d, random, 90);
        roofPlant(site, w * 0.2, lz, height, w * 0.5, d * 0.6, random, 110);
      } else {
        // Individual buildings, four lots to a block.
        lots(2, (lx, lz, w, d, k) => {
          const height = (10 + 24 * random(k + 30)) * scale;
          midRise(site, lx, lz, w, d, height, random, 100 + k * 100);
        });
      }
    }
  }

  bridges(out);
  return out;
}

/** Bridges carry the avenues across the river. */
function bridges(out: Structure[]): void {
  let index = 0;
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
    const rotation = Math.atan2(-slope / length, 1 / length);
    const seed = hash2(Math.round(d), 3);
    const site = createSite(out, x, z, rotation, 0, true);
    const span = 300;
    const deckY = 9;
    const deckDepth = 22;

    site.part("bridge", "box", 0, 0, deckY, span, 2.4, deckDepth, seed);
    // Parapets either side of the roadway.
    for (const side of [-1, 1]) {
      site.part("concrete", "box", 0, side * (deckDepth / 2 - 0.3), deckY + 2.4, span, 1.1, 0.5, seed);
    }
    // Piers at even spacing, standing in the river and on its banks.
    const steelArch = index % 3 === 1;
    const piers = steelArch ? [-95, 95] : [-112.5, -67.5, -22.5, 22.5, 67.5, 112.5];
    for (const lx of piers) {
      site.part("concrete", "box", lx, 0, -6, steelArch ? 7 : 4, deckY + 6, deckDepth - 3, seed);
    }
    if (steelArch) {
      // A through arch over the main span, with hangers down to the deck.
      for (const side of [-1, 1]) {
        const lz = side * (deckDepth / 2 - 1.4);
        site.part("steel", "arch", 0, lz, deckY + 1.2, 190, 34, 1.6, 0.3 + 0.4 * seed);
        for (let h = -3; h <= 3; h++) {
          const lx = h * 23.75;
          const rise = 34 * Math.sqrt(1 - (lx / 95) ** 2);
          site.part("steel", "box", lx, lz, deckY + 2.4, 0.5, rise - 2.2, 0.5, 0.3 + 0.4 * seed);
        }
      }
      // Bracing between the two ribs near the crown.
      for (const lx of [-40, 0, 40]) {
        const rise = 34 * Math.sqrt(1 - (lx / 95) ** 2);
        site.part("steel", "box", lx, 0, deckY + rise - 0.6, 1, 1, deckDepth - 2.8, 0.3 + 0.4 * seed);
      }
    }
    index++;
  }
}

// ---------------------------------------------------------------------------
// Industrial plain
// ---------------------------------------------------------------------------

const INDUSTRY_FROM = REGION_BOUNDARIES[1]! - REGION_BLEND / 2;
const INDUSTRY_TO = REGION_BOUNDARIES[2]! + REGION_BLEND / 2;

/** May a structure stand at this world point of the plain? */
function plainClear(x: number, z: number): boolean {
  if (Math.abs(routeLateralAt(x, z) - canalLine(-z)) < 70) return false;
  return !onWater(x, z);
}

/** Is every corner of a structure's footprint, and its centre, on dry land? */
function footprintClear(structure: Structure, clear: (x: number, z: number) => boolean): boolean {
  const c = Math.cos(structure.rotation);
  const s = Math.sin(structure.rotation);
  const hw = structure.width / 2;
  const hd = structure.depth / 2;
  for (const [fx, fz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const lx = fx * hw;
    const lz = fz * hd;
    if (!clear(structure.x + c * lx + s * lz, structure.z - s * lx + c * lz)) return false;
  }
  return true;
}

/**
 * Runs `build`, which adds the parts of one feature (a building, a tank
 * farm) to `out`, and takes them all back out again if any part would stand
 * in water. A feature is placed whole or not at all.
 */
function placeWhole(out: Structure[], clear: (x: number, z: number) => boolean, build: () => void): void {
  const start = out.length;
  build();
  for (let i = start; i < out.length; i++) {
    if (!footprintClear(out[i]!, clear)) {
      out.length = start;
      return;
    }
  }
}

/** A shed: clad walls under one or more low-pitched roof spans. */
function shed(
  site: Site,
  lx: number,
  lz: number,
  width: number,
  depth: number,
  eaves: number,
  seed: number,
  roofSeed: number,
): void {
  site.part("industrial", "box", lx, lz, 0, width, eaves, depth, seed);
  // Spans run the length of the building, side by side across it.
  const alongX = width >= depth;
  const across = alongX ? depth : width;
  const along = alongX ? width : depth;
  const spans = Math.max(1, Math.round(across / 30));
  const spanWidth = across / spans;
  for (let i = 0; i < spans; i++) {
    const offset = -across / 2 + (i + 0.5) * spanWidth;
    if (alongX) {
      site.part("metalRoof", "gable", lx, lz + offset, eaves, spanWidth + 0.6, spanWidth * 0.11 + 0.8, along + 1, roofSeed, QUARTER);
    } else {
      site.part("metalRoof", "gable", lx + offset, lz, eaves, spanWidth + 0.6, spanWidth * 0.11 + 0.8, along + 1, roofSeed);
    }
  }
}

/** A storage tank: shell, roof and the walkway rail around its rim. */
function tank(site: Site, lx: number, lz: number, diameter: number, height: number, seed: number): void {
  site.part("tank", "cylinder", lx, lz, 0, diameter, height, diameter, seed);
  if (seed < 0.55) {
    site.part("tank", "cone", lx, lz, height, diameter * 1.01, diameter * 0.09, diameter * 1.01, seed);
  } else {
    site.part("tank", "dome", lx, lz, height, diameter * 1.01, diameter * 0.2, diameter * 1.01, seed);
  }
}

/** A rubber-tyred gantry crane straddling the container rows. */
function gantryCrane(site: Site, lx: number, lz: number, span: number, seed: number): void {
  const height = 19;
  const reach = 9;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      site.part("steel", "box", lx + (sx * reach) / 2, lz + (sz * span) / 2, 0, 1.1, height, 1.1, seed);
    }
    // Sill beams along each side, and the two main girders across the top.
    site.part("steel", "box", lx + (sx * reach) / 2, lz, height - 1.6, 1.4, 1.6, span + 2.4, seed);
  }
  for (const sz of [-1, 1]) {
    site.part("steel", "box", lx, lz + (sz * span) / 2, 1.2, reach + 1.6, 1.3, 1.5, seed);
  }
  // Trolley and operator cab under the girders.
  site.part("plant", "box", lx, lz + span * 0.18, height - 4.4, 3.4, 2.8, 3.2, seed);
}

export function industrialStructures(): Structure[] {
  const out: Structure[] = [];
  const P = INDUSTRIAL_PLOT;
  const iz0 = Math.floor(-INDUSTRY_TO / P);
  const iz1 = Math.ceil(-INDUSTRY_FROM / P);
  const ix0 = Math.floor(-5_200 / P);
  const ix1 = Math.ceil(5_200 / P);

  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const use = industrialPlot(ix, iz);
      if (use === 0) continue;
      const random = randomFor(ix + 5_000, iz + 9_000);
      const span = P - 44;
      // Plot frame: origin at the plot's corner inside its perimeter road.
      const px = ix * P + 22;
      const pz = iz * P + 22;
      const site = createSite(out, px, pz, 0, baseAt(px + span / 2, pz + span / 2));
      const clear = (lx: number, lz: number) => plainClear(px + lx, pz + lz);
      const whole = (build: () => void) => placeWhole(out, plainClear, build);
      const turned = random(1) < 0.5;

      if (use === 1) {
        // Works: a production hall, offices, chimneys and a tank farm or silos.
        const w = 96 + 80 * random(2);
        const d = 54 + 40 * random(3);
        const hallX = span * 0.34;
        const hallZ = span * 0.32;
        if (clear(hallX, hallZ)) {
          whole(() => shed(site, hallX, hallZ, turned ? d : w, turned ? w : d, 13 + 9 * random(4), random(5), random(40)));
        }
        const officeX = span * 0.84;
        const officeZ = span * 0.16;
        if (clear(officeX, officeZ)) {
          const ow = 26 + 14 * random(6);
          const od = 20 + 10 * random(7);
          const oh = 9 + 7 * random(8);
          whole(() => {
            site.part("office", "box", officeX, officeZ, 0, ow, oh, od, random(9));
            roofPlant(site, officeX, officeZ, oh, ow, od, random, 50);
          });
        }
        if (random(10) > 0.35) {
          const stacks = random(11) > 0.6 ? 2 : 1;
          for (let s = 0; s < stacks; s++) {
            const lx = span * (0.72 + 0.12 * s);
            const lz = span * 0.47;
            if (!clear(lx, lz)) continue;
            const diameter = 6.5 + 3 * random(12 + s);
            whole(() => {
              site.part("stack", "taper", lx, lz, 0, diameter, 48 + 40 * random(14 + s), diameter, random(16 + s));
              site.part("concrete", "box", lx, lz, 0, diameter + 5, 5, diameter + 5, 0.4);
            });
          }
        }
        const yard = random(18);
        whole(() => {
          if (yard > 0.86 && clear(span * 0.5, span * 0.78)) {
            // A pair of cooling towers.
            for (const s of [0, 1]) {
              const diameter = 46 + 8 * random(19 + s);
              site.part("concrete", "cooling", span * (0.28 + 0.4 * s), span * 0.78, 0, diameter, 58 + 12 * random(21 + s), diameter, random(23 + s));
            }
          } else if (yard > 0.66 && clear(span * 0.2, span * 0.8)) {
            // Silos in two rows, with the conveyor housing along their tops.
            const count = 3 + Math.floor(random(19) * 3);
            const diameter = 9 + 3 * random(20);
            const height = 26 + 10 * random(21);
            for (let t = 0; t < count; t++) {
              for (const row of [0, 1]) {
                const lx = span * 0.1 + t * (diameter + 1.2);
                const lz = span * 0.78 + row * (diameter + 1.2);
                site.part("concrete", "cylinder", lx, lz, 0, diameter, height, diameter, random(22 + t));
                site.part("concrete", "cone", lx, lz, height, diameter, diameter * 0.22, diameter, random(22 + t));
              }
            }
            const run = (count - 1) * (diameter + 1.2);
            site.part("industrial", "box", span * 0.1 + run / 2, span * 0.78 + (diameter + 1.2) / 2, height + diameter * 0.16, run + 6, 3.2, 3.6, random(30));
          } else if (yard > 0.3 && clear(span * 0.2, span * 0.82)) {
            // A tank farm inside its bund wall.
            const tanks = 2 + Math.floor(random(19) * 4);
            const diameter = 14 + 12 * random(20);
            const pitch = diameter + 7;
            const height = 9 + 7 * random(21);
            for (let t = 0; t < tanks; t++) {
              tank(site, span * 0.1 + t * pitch, span * 0.82, diameter, height * (0.85 + 0.3 * random(24 + t)), random(22 + t));
            }
            const run = (tanks - 1) * pitch;
            const bundX = span * 0.1 + run / 2;
            const bundW = run + diameter + 10;
            const bundD = diameter + 10;
            for (const side of [-1, 1]) {
              site.part("concrete", "box", bundX, span * 0.82 + (side * bundD) / 2, 0, bundW, 2, 0.6, 0.5);
              site.part("concrete", "box", bundX + (side * bundW) / 2, span * 0.82, 0, 0.6, 2, bundD, 0.5);
            }
            // Pipe rack running back toward the hall.
            site.part("steel", "box", bundX, span * 0.82 - bundD / 2 - 4, 4.5, bundW * 0.9, 1.1, 2.2, 0.7);
            if (random(28) > 0.5) {
              // Pressurised spheres on their legs.
              for (let s = 0; s < 2; s++) {
                const lx = bundX + bundW / 2 + 16 + s * 17;
                if (lx > span - 10) break;
                site.part("concrete", "cylinder", lx, span * 0.82, 0, 6, 5, 6, 0.5);
                site.part("tank", "sphere", lx, span * 0.82, 3, 13, 13, 13, random(29 + s));
              }
            }
          }
        });
      } else if (use === 2) {
        // Logistics yard: a warehouse, rows of stacked containers and cranes.
        if (clear(span * 0.5, span * 0.2)) {
          whole(() => shed(site, span * 0.5, span * 0.2, 176, 64, 12 + 3 * random(2), random(3), random(40)));
        }
        const rows = 4 + Math.floor(random(4) * 4);
        const firstRow = span * 0.48;
        for (let r = 0; r < rows; r++) {
          const length = 12.2 * (4 + Math.floor(random(5 + r) * 5));
          const lx = 20 + length / 2 + random(15 + r) * (span - length - 40);
          const lz = firstRow + r * 11;
          if (!clear(lx, lz)) continue;
          whole(() =>
            site.part("containers", "box", lx, lz, 0, length, 2.6 * (1 + Math.floor(random(25 + r) * 3)), 4.9, random(35 + r)),
          );
        }
        const cranes = 1 + (random(45) > 0.5 ? 1 : 0);
        for (let c = 0; c < cranes; c++) {
          const lx = span * (0.3 + 0.38 * c + 0.1 * random(46 + c));
          const lz = firstRow + (Math.min(rows, 3) - 1) * 5.5;
          if (clear(lx, lz)) whole(() => gantryCrane(site, lx, lz, Math.min(rows, 3) * 11 + 6, random(48 + c) < 0.5 ? 0.1 : 0.9));
        }
      } else {
        // Warehouses: long, low sheds side by side.
        const sheds = 2 + Math.floor(random(2) * 2);
        for (let s = 0; s < sheds; s++) {
          const lz = 40 + s * (span / sheds);
          if (!clear(span * 0.5, lz)) continue;
          whole(() => {
            shed(site, span * 0.5, lz, 170 + 30 * random(3 + s), 54, 11 + 4 * random(6 + s), random(9 + s), random(40 + s));
            // Trailers backed up to the loading docks.
            if (random(12 + s) > 0.35) {
              site.part("containers", "box", span * 0.5, lz + 27 + 9, 0, 12.2 * (5 + Math.floor(random(15 + s) * 6)), 2.9, 13.6, random(18 + s), 0);
            }
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
  const out: Structure[] = [];
  const site = createSite(out, 0, 0, 0, -0.2);

  // Terminal: a long glazed concourse under an oversailing roof, with a
  // lower landside block behind it and piers reaching onto the apron.
  site.part("terminal", "box", 600, -1_425, 0, 70, 15, 480, 0.3);
  site.part("metalRoof", "gable", 600, -1_425, 15, 82, 5.5, 492, 0.72);
  site.part("office", "box", 652, -1_425, 0, 34, 10, 380, 0.52);
  site.part("plant", "box", 652, -1_340, 10, 14, 3, 30, 0.4);
  site.part("plant", "box", 652, -1_500, 10, 12, 3, 22, 0.6);
  for (const z of [-1_250, -1_370, -1_490, -1_610]) {
    site.part("terminal", "box", 548, z, 3.2, 36, 3.4, 4.2, 0.5);
    site.part("concrete", "cylinder", 531, z, 0, 5, 7, 5, 0.5);
  }

  // Control tower: a tapering shaft, a wider glazed cab and its roof.
  site.part("concrete", "taper", 640, -1_080, 0, 11, 34, 11, 0.6);
  site.part("concrete", "cylinder", 640, -1_080, 33, 13.5, 2.2, 13.5, 0.6);
  site.part("terminal", "cylinder", 640, -1_080, 35.2, 12.5, 4.6, 12.5, 0.7);
  site.part("metalRoof", "cone", 640, -1_080, 39.8, 14.2, 1.8, 14.2, 0.2);
  site.part("steel", "taper", 640, -1_080, 41.6, 0.9, 9, 0.9, 0.05);

  // Hangars with wide doors facing the apron, and a maintenance shed.
  shed(site, 300, -2_050, 86, 72, 19, 0.2, 0.75);
  shed(site, 300, -2_180, 86, 72, 19, 0.6, 0.78);
  shed(site, 420, -2_115, 60, 50, 13, 0.45, 0.7);
  // Fuel farm.
  for (let t = 0; t < 3; t++) tank(site, 470 + t * 26, -2_250, 19, 11, 0.2 + 0.3 * t);
  return out;
}
