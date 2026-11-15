/**
 * The world's terrain: one continuous landscape along the route, with six
 * regions that follow the six chapters.
 *
 *   1  coast        tropical coastline, countryside and the departure airfield
 *   2  mountains    a river valley between forested ridges
 *   3  industrial   a broad plain with works, yards and a canal
 *   4  terrain      ridged uplands cut by rivers, seen from above as a map
 *   5  city         a river city with a business district
 *   6  highlands    rolling country under a cloud deck, mountains on the horizon
 *
 * Regions are laid out by distance along the route and blend into each other
 * over a few kilometres around each chapter boundary, so the geography
 * changes the way it would on a real flight.
 *
 * The same functions exist twice: in TypeScript (below) for terrain tile
 * geometry, object placement, camera clearance and tests, and in GLSL
 * (`TERRAIN_GLSL`) for per-pixel detail such as rivers, streets and land use.
 * Noise is built on an integer hash so both produce the same values; keep the
 * two versions in step when changing either.
 *
 * World axes: metres, +Y up, the route runs toward -Z, so a point's distance
 * along the route is simply -z.
 */

import { clamp, lerp, smoothstep } from "./math";
import { MEANDER, routeDistance, routeLateral } from "./path";
import { CHAPTER_RANGES } from "./timeline";

// ---------------------------------------------------------------------------
// Noise
// ---------------------------------------------------------------------------

/** Keeps lattice coordinates positive before they are hashed. */
const LATTICE_OFFSET = 1 << 20;

/** Integer hash of a lattice point, in [0, 1). Bit-identical to tHash in GLSL. */
export function hash2(ix: number, iy: number): number {
  const qx = (ix + LATTICE_OFFSET) | 0;
  const qy = (iy + LATTICE_OFFSET) | 0;
  let h = Math.imul(qx, 0x27d4eb2d) ^ Math.imul(qy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Fractal value noise, normalised to [0, 1]. */
export function fbm(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise(x, y);
    total += amplitude;
    x = x * 2.03 + 17.3;
    y = y * 2.03 + 9.1;
    amplitude *= 0.5;
  }
  return value / total;
}

/** Ridged fractal noise in [0, 1]: sharp crests, rounded valleys. */
export function ridged(x: number, y: number, octaves: number): number {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(2 * valueNoise(x, y) - 1);
    value += amplitude * n * n;
    total += amplitude;
    x = x * 2.07 + 31.7;
    y = y * 2.07 + 11.3;
    amplitude *= 0.5;
  }
  return value / total;
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export const REGION_NAMES = [
  "coast",
  "mountains",
  "industrial",
  "terrain",
  "city",
  "highlands",
] as const;

export type RegionName = (typeof REGION_NAMES)[number];

export const REGION_COUNT = REGION_NAMES.length;

/** Route distance at which each region hands over to the next: the start of chapters 2–6. */
export const REGION_BOUNDARIES: readonly number[] = ([2, 3, 4, 5, 6] as const).map((n) =>
  Math.round(routeDistance(CHAPTER_RANGES[n][0])),
);

/** Width, in metres of route, of the blend between neighbouring regions. */
export const REGION_BLEND = 2_600;

/**
 * How much each region contributes at a route distance. The weights always
 * sum to 1. Allocation-free: fills and returns `out`.
 */
export function regionWeights(distance: number, out: number[]): number[] {
  let before = 1;
  for (let i = 0; i < REGION_COUNT; i++) {
    const boundary = REGION_BOUNDARIES[i];
    const after =
      boundary === undefined
        ? 0
        : smoothstep(-REGION_BLEND / 2, REGION_BLEND / 2, distance - boundary);
    out[i] = before - after;
    before = after;
  }
  return out;
}

/** The dominant region at a route distance. */
export function regionAt(distance: number): RegionName {
  const weights = regionWeights(distance, []);
  let best = 0;
  for (let i = 1; i < REGION_COUNT; i++) if (weights[i]! > weights[best]!) best = i;
  return REGION_NAMES[best]!;
}

// ---------------------------------------------------------------------------
// Features shared by geometry and shading
// ---------------------------------------------------------------------------

/** The departure airfield, which is kept perfectly flat at sea level. */
export const AIRFIELD = { minX: -420, maxX: 720, minZ: -3_300, maxZ: 900, blend: 380 } as const;

/** 1 on the airfield, 0 away from it. */
export function airfieldMask(x: number, z: number): number {
  const outX = Math.max(AIRFIELD.minX - x, x - AIRFIELD.maxX, 0);
  const outZ = Math.max(AIRFIELD.minZ - z, z - AIRFIELD.maxZ, 0);
  return (1 - smoothstep(0, AIRFIELD.blend, outX)) * (1 - smoothstep(0, AIRFIELD.blend, outZ));
}

/** World X of the coastline (sea to the west, -X) at a route distance. */
export function coastline(distance: number): number {
  return (
    -1_500 -
    300 * smoothstep(4_000, 7_500, distance) -
    5_000 * smoothstep(8_200, 11_800, distance) +
    520 * (fbm(distance / 1_700, 3.7, 3) - 0.5)
  );
}

/** Lateral offset of the mountain river from the route. */
export function valleyRiver(distance: number): number {
  return 170 * Math.sin(distance / 1_650 + 0.4) + 90 * Math.sin(distance / 730 + 2.1);
}

/** Lateral offset of the industrial canal from the route. */
export function canalLine(distance: number): number {
  return 950 + 260 * Math.sin(distance / 2_300);
}

/** Lateral offset of the city's river: it crosses under the route mid-chapter. */
export function cityRiver(distance: number): number {
  return -1_100 * Math.sin((distance - 35_500) / 3_800) + 120 * Math.sin(distance / 1_300);
}

/** Lateral offset of the main upland river, which winds beneath the route. */
export function uplandRiver(distance: number): number {
  return 380 * Math.sin(distance / 1_500 + 1) + 150 * Math.sin(distance / 640 + 0.3);
}

/** Field whose 0.5 contour is a tributary river in the upland region. */
export function uplandRiverField(x: number, z: number): number {
  return fbm(x / 4_200 + 40, z / 4_200, 3);
}

/** City street grid: rotated against the route, in blocks with wider avenues. */
export const CITY_GRID = {
  angle: 0.21,
  block: 150,
  street: 20,
  avenueEvery: 4,
  avenue: 34,
} as const;

/**
 * Business district centre: a few kilometres right of the route, where it
 * rises as a skyline in the chapter's side and close-up shots.
 */
export const CITY_CENTRE = { distance: 36_200, lateral: 3_100, radius: 1_050 } as const;

/** The city spreads either side of this lateral offset from the route. */
export const CITY_AXIS = 900;

/** Industrial land is divided into plots of this size, axis-aligned. */
export const INDUSTRIAL_PLOT = 320;

/** Half-widths of the water bodies, in metres. */
export const WATER_WIDTH = {
  valleyRiver: 26,
  canal: 28,
  cityRiver: 90,
  uplandMain: 24,
  /** In units of the upland river field, not metres. */
  uplandRiver: 0.005,
} as const;

// ---------------------------------------------------------------------------
// Height
// ---------------------------------------------------------------------------

export interface TerrainSample {
  /** Elevation of the visible surface (water surface where there is water). */
  height: number;
  /** 0 on land, 1 on water. */
  water: number;
}

export function createTerrainSample(): TerrainSample {
  return { height: 0, water: 0 };
}

const region: TerrainSample = createTerrainSample();

function coastRegion(x: number, z: number, distance: number, out: TerrainSample): void {
  const inland = x - coastline(distance);
  const hills =
    6 + 34 * fbm(x / 2_300, z / 2_300, 4) + 8 * fbm(x / 420 + 5.3, z / 420, 3);
  const upland = 260 * smoothstep(3_500, 9_000, inland) * fbm(x / 3_800 + 11.1, z / 3_800, 4);
  const land = hills * smoothstep(-40, 600, inland) + upland + 0.6;
  const sea = -2 - 28 * smoothstep(0, 1_200, -inland);
  const height = lerp(sea, land, smoothstep(-80, 60, inland));
  const field = airfieldMask(x, z);
  out.height = lerp(height, 0, field);
  out.water = (1 - smoothstep(-6, 6, inland)) * (1 - field);
}

function mountainRegion(x: number, z: number, distance: number, lateral: number, out: TerrainSample): void {
  const fromRiver = Math.abs(lateral - valleyRiver(distance));
  const floor = 40 + 25 * fbm(x / 1_500, z / 1_500, 3);
  const walls = smoothstep(380, 3_400, fromRiver);
  const massif = 1_350 * walls * (0.45 + 0.55 * ridged(x / 2_600, z / 2_600, 5));
  const spurs = 260 * smoothstep(200, 1_300, fromRiver) * ridged(x / 800 + 7, z / 800, 4);
  const channel = 1 - smoothstep(WATER_WIDTH.valleyRiver - 4, 60, fromRiver);
  out.height = lerp(floor + massif + spurs, floor - 6, channel);
  out.water = 1 - smoothstep(WATER_WIDTH.valleyRiver - 4, WATER_WIDTH.valleyRiver + 4, fromRiver);
}

function industrialRegion(x: number, z: number, distance: number, lateral: number, out: TerrainSample): void {
  const fromCanal = Math.abs(lateral - canalLine(distance));
  const plain = 7 + 16 * fbm(x / 3_600, z / 3_600, 3) + 2.5 * fbm(x / 380, z / 380, 2);
  out.height = lerp(plain, 3, 1 - smoothstep(WATER_WIDTH.canal, 60, fromCanal));
  out.water = 1 - smoothstep(WATER_WIDTH.canal - 3, WATER_WIDTH.canal + 3, fromCanal);
}

function uplandRegion(x: number, z: number, distance: number, lateral: number, out: TerrainSample): void {
  const fromRiver = Math.abs(uplandRiverField(x, z) - 0.5);
  const fromMain = Math.abs(lateral - uplandRiver(distance));
  const valley = Math.min(smoothstep(0, 0.07, fromRiver), smoothstep(40, 900, fromMain));
  const ridges = ridged(x / 3_200, z / 3_200, 5);
  const rolling = fbm(x / 700 + 3, z / 700, 3);
  const land = 40 + valley * (480 * ridges + 80 * rolling);
  const channel = Math.max(
    1 - smoothstep(WATER_WIDTH.uplandRiver, 0.012, fromRiver),
    1 - smoothstep(WATER_WIDTH.uplandMain, 70, fromMain),
  );
  out.height = lerp(land, 32, channel);
  out.water = Math.max(
    1 - smoothstep(WATER_WIDTH.uplandRiver * 0.8, WATER_WIDTH.uplandRiver * 1.2, fromRiver),
    1 - smoothstep(WATER_WIDTH.uplandMain - 3, WATER_WIDTH.uplandMain + 3, fromMain),
  );
}

function cityRegion(x: number, z: number, distance: number, lateral: number, out: TerrainSample): void {
  const fromRiver = Math.abs(lateral - cityRiver(distance));
  const ground = 5 + 9 * fbm(x / 4_200, z / 4_200, 3);
  out.height = lerp(ground, 0.4, 1 - smoothstep(WATER_WIDTH.cityRiver, 160, fromRiver));
  out.water = 1 - smoothstep(WATER_WIDTH.cityRiver - 4, WATER_WIDTH.cityRiver + 4, fromRiver);
}

function highlandRegion(x: number, z: number, lateral: number, out: TerrainSample): void {
  const base = 120 + 260 * fbm(x / 3_000, z / 3_000, 4);
  const far = smoothstep(4_500, 15_000, Math.abs(lateral));
  const peaks = 2_900 * far * Math.pow(ridged(x / 5_200 + 9, z / 5_200, 5), 1.6);
  out.height = base + peaks;
  out.water = 0;
}

const weights: number[] = new Array<number>(REGION_COUNT).fill(0);

/** Lateral position relative to the route at a world point. */
export function routeLateralAt(x: number, z: number): number {
  return x - routeLateral(Math.max(-z, 0));
}

/**
 * Terrain at a world point. Allocation-free: fills and returns `out`.
 */
export function sampleTerrain(x: number, z: number, out: TerrainSample): TerrainSample {
  const distance = -z;
  const lateral = routeLateralAt(x, z);
  regionWeights(distance, weights);

  let height = 0;
  let water = 0;
  for (let i = 0; i < REGION_COUNT; i++) {
    const weight = weights[i]!;
    if (weight < 1e-4) continue;
    switch (i) {
      case 0:
        coastRegion(x, z, distance, region);
        break;
      case 1:
        mountainRegion(x, z, distance, lateral, region);
        break;
      case 2:
        industrialRegion(x, z, distance, lateral, region);
        break;
      case 3:
        uplandRegion(x, z, distance, lateral, region);
        break;
      case 4:
        cityRegion(x, z, distance, lateral, region);
        break;
      default:
        highlandRegion(x, z, lateral, region);
    }
    height += weight * region.height;
    water += weight * region.water;
  }

  // The sea surface is flat; anything below it is under water.
  out.water = clamp(Math.max(water, smoothstep(0, -1, height)), 0, 1);
  out.height = Math.max(height, 0);
  return out;
}

const scratch = createTerrainSample();

/** Elevation of the visible surface at a world point. */
export function terrainHeight(x: number, z: number): number {
  return sampleTerrain(x, z, scratch).height;
}

// ---------------------------------------------------------------------------
// Land use, shared by object placement and shading
// ---------------------------------------------------------------------------

/** Converts a world point to city grid coordinates (metres, rotated). */
export function toCityGrid(x: number, z: number): [number, number] {
  const c = Math.cos(CITY_GRID.angle);
  const s = Math.sin(CITY_GRID.angle);
  return [c * x - s * z, s * x + c * z];
}

/** Converts city grid coordinates back to a world point. */
export function fromCityGrid(u: number, v: number): [number, number] {
  const c = Math.cos(CITY_GRID.angle);
  const s = Math.sin(CITY_GRID.angle);
  return [c * u + s * v, -s * u + c * v];
}

/** How built-up the city is at a world point, 0–1, before water and parks. */
export function urbanDensity(x: number, z: number): number {
  const distance = -z;
  const city = regionWeights(distance, weights)[4]!;
  const lateral = routeLateralAt(x, z);
  const extent = 1 - smoothstep(3_800, 6_200, Math.abs(lateral - CITY_AXIS));
  return city * extent;
}

/** Height scale of the business district at a world point, 0–1. */
export function downtown(x: number, z: number): number {
  const along = -z - CITY_CENTRE.distance;
  const across = routeLateralAt(x, z) - CITY_CENTRE.lateral;
  const r2 = (along * along) / 1.8 + across * across;
  return Math.exp(-r2 / (2 * CITY_CENTRE.radius * CITY_CENTRE.radius));
}

/** A city block is a park if its hash is below this. */
export const PARK_SHARE = 0.09;

/**
 * Industrial plot use at plot indices: 0 farmland, 1 works, 2 logistics yard,
 * 3 warehouses. Zoned by the industrial region weight and distance from the
 * route.
 */
export function industrialPlot(ix: number, iz: number): number {
  const cx = (ix + 0.5) * INDUSTRIAL_PLOT;
  const cz = (iz + 0.5) * INDUSTRIAL_PLOT;
  const zone =
    regionWeights(-cz, weights)[2]! *
    (1 - smoothstep(1_200, 3_200, Math.abs(routeLateralAt(cx, cz))));
  const roll = hash2(ix, iz + 7_771);
  if (roll > zone * 0.75) return 0;
  const kind = hash2(ix + 913, iz);
  return kind < 0.4 ? 1 : kind < 0.65 ? 2 : 3;
}

// ---------------------------------------------------------------------------
// GLSL mirror
// ---------------------------------------------------------------------------

const f = (value: number) => {
  const text = String(value);
  return text.includes(".") || text.includes("e") ? text : `${text}.0`;
};

const B = REGION_BOUNDARIES;

/**
 * GLSL ES 3.00 versions of the functions above, for per-pixel detail. Names
 * are prefixed with `t` to stay clear of other shader chunks.
 */
export const TERRAIN_GLSL = /* glsl */ `
  float tHash(ivec2 c) {
    uvec2 q = uvec2(c + ivec2(${LATTICE_OFFSET}));
    uint h = (q.x * 0x27d4eb2du) ^ (q.y * 0x165667b1u);
    h = (h ^ (h >> 15u)) * 0x85ebca6bu;
    h ^= h >> 13u;
    h *= 0xc2b2ae35u;
    h ^= h >> 16u;
    return float(h) * (1.0 / 4294967296.0);
  }

  float tNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 fr = p - i;
    vec2 u = fr * fr * (3.0 - 2.0 * fr);
    ivec2 c = ivec2(i);
    float a = tHash(c);
    float b = tHash(c + ivec2(1, 0));
    float cc = tHash(c + ivec2(0, 1));
    float d = tHash(c + ivec2(1, 1));
    return a + (b - a) * u.x + (cc - a) * u.y + (a - b - cc + d) * u.x * u.y;
  }

  float tFbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float total = 0.0;
    for (int i = 0; i < octaves; i++) {
      value += amplitude * tNoise(p);
      total += amplitude;
      p = p * 2.03 + vec2(17.3, 9.1);
      amplitude *= 0.5;
    }
    return value / total;
  }

  float tRouteLateral(float d) {
    float envelope = clamp((d - ${f(MEANDER.from)}) / ${f(MEANDER.full - MEANDER.from)}, 0.0, 1.0);
    envelope = envelope * envelope * envelope * (envelope * (envelope * 6.0 - 15.0) + 10.0);
    return envelope * (
      ${f(MEANDER.waveA.amplitude)} * sin(6.283185307 * d / ${f(MEANDER.waveA.length)} + ${f(MEANDER.waveA.phase)}) +
      ${f(MEANDER.waveB.amplitude)} * sin(6.283185307 * d / ${f(MEANDER.waveB.length)} + ${f(MEANDER.waveB.phase)})
    );
  }

  // Region weights: coast, mountains, industrial, uplands, city, highlands.
  void tRegionWeights(float d, out float w[6]) {
    float s0 = smoothstep(${f(-REGION_BLEND / 2)}, ${f(REGION_BLEND / 2)}, d - ${f(B[0]!)});
    float s1 = smoothstep(${f(-REGION_BLEND / 2)}, ${f(REGION_BLEND / 2)}, d - ${f(B[1]!)});
    float s2 = smoothstep(${f(-REGION_BLEND / 2)}, ${f(REGION_BLEND / 2)}, d - ${f(B[2]!)});
    float s3 = smoothstep(${f(-REGION_BLEND / 2)}, ${f(REGION_BLEND / 2)}, d - ${f(B[3]!)});
    float s4 = smoothstep(${f(-REGION_BLEND / 2)}, ${f(REGION_BLEND / 2)}, d - ${f(B[4]!)});
    w[0] = 1.0 - s0;
    w[1] = s0 - s1;
    w[2] = s1 - s2;
    w[3] = s2 - s3;
    w[4] = s3 - s4;
    w[5] = s4;
  }

  float tAirfield(vec2 p) {
    float outX = max(max(${f(AIRFIELD.minX)} - p.x, p.x - ${f(AIRFIELD.maxX)}), 0.0);
    float outZ = max(max(${f(AIRFIELD.minZ)} - p.y, p.y - ${f(AIRFIELD.maxZ)}), 0.0);
    return (1.0 - smoothstep(0.0, ${f(AIRFIELD.blend)}, outX)) * (1.0 - smoothstep(0.0, ${f(AIRFIELD.blend)}, outZ));
  }

  float tCoastline(float d) {
    return -1500.0 - 300.0 * smoothstep(4000.0, 7500.0, d) - 5000.0 * smoothstep(8200.0, 11800.0, d)
      + 520.0 * (tFbm(vec2(d / 1700.0, 3.7), 3) - 0.5);
  }

  float tValleyRiver(float d) {
    return 170.0 * sin(d / 1650.0 + 0.4) + 90.0 * sin(d / 730.0 + 2.1);
  }

  float tCanalLine(float d) {
    return 950.0 + 260.0 * sin(d / 2300.0);
  }

  float tCityRiver(float d) {
    return -1100.0 * sin((d - 35500.0) / 3800.0) + 120.0 * sin(d / 1300.0);
  }

  float tUplandRiver(float d) {
    return 380.0 * sin(d / 1500.0 + 1.0) + 150.0 * sin(d / 640.0 + 0.3);
  }

  float tUplandRiverField(vec2 p) {
    return tFbm(vec2(p.x / 4200.0 + 40.0, p.y / 4200.0), 3);
  }

  vec2 tToCityGrid(vec2 p) {
    float c = ${f(Math.cos(CITY_GRID.angle))};
    float s = ${f(Math.sin(CITY_GRID.angle))};
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float tDowntown(vec2 p, float lateral) {
    float along = -p.y - ${f(CITY_CENTRE.distance)};
    float across = lateral - ${f(CITY_CENTRE.lateral)};
    float r2 = along * along / 1.8 + across * across;
    return exp(-r2 / ${f(2 * CITY_CENTRE.radius * CITY_CENTRE.radius)});
  }

  // Industrial plot use: 0 farmland, 1 works, 2 logistics yard, 3 warehouses.
  float tIndustrialPlot(ivec2 plot) {
    vec2 centre = (vec2(plot) + 0.5) * ${f(INDUSTRIAL_PLOT)};
    float w[6];
    tRegionWeights(-centre.y, w);
    float lateral = centre.x - tRouteLateral(max(-centre.y, 0.0));
    float zone = w[2] * (1.0 - smoothstep(1200.0, 3200.0, abs(lateral)));
    float roll = tHash(plot + ivec2(0, 7771));
    if (roll > zone * 0.75) return 0.0;
    float kind = tHash(plot + ivec2(913, 0));
    return kind < 0.4 ? 1.0 : kind < 0.65 ? 2.0 : 3.0;
  }
`;

/** Constants the terrain shader needs alongside TERRAIN_GLSL. */
export const TERRAIN_CONSTANTS = {
  cityBlock: CITY_GRID.block,
  cityStreet: CITY_GRID.street,
  cityAvenue: CITY_GRID.avenue,
  cityAvenueEvery: CITY_GRID.avenueEvery,
  industrialPlot: INDUSTRIAL_PLOT,
  parkShare: PARK_SHARE,
  water: WATER_WIDTH,
} as const;
