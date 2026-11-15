/**
 * Builds the vertex data for one square terrain tile.
 *
 * Tiles are fixed in the world (they never slide with the camera), so the
 * surface never "swims". Every tile has the same topology regardless of its
 * size; level of detail comes from choosing bigger or smaller tiles. A skirt
 * hangs from each edge to hide cracks where neighbours differ in detail.
 *
 * Pure and allocation-light, so it can run in a worker if needed.
 */

import { createTerrainSample, sampleTerrain } from "./terrain";

/** Quads along each side of a tile. */
export const TILE_SEGMENTS = 28;

const SIDE = TILE_SEGMENTS + 1;
/** Vertices in the surface grid. */
export const TILE_SURFACE_VERTICES = SIDE * SIDE;
/** Vertices in the surface grid plus the skirt. */
export const TILE_VERTICES = TILE_SURFACE_VERTICES + 4 * TILE_SEGMENTS;

export interface TileData {
  /** Positions relative to the tile centre (x, height, z). */
  positions: Float32Array;
  normals: Float32Array;
  /** 0 on land, 1 on water. */
  water: Float32Array;
  minHeight: number;
  maxHeight: number;
}

/** Order in which the skirt walks the tile edge: index into the surface grid. */
function skirtRing(): number[] {
  const ring: number[] = [];
  const at = (i: number, j: number) => j * SIDE + i;
  for (let i = 0; i < TILE_SEGMENTS; i++) ring.push(at(i, 0));
  for (let j = 0; j < TILE_SEGMENTS; j++) ring.push(at(TILE_SEGMENTS, j));
  for (let i = TILE_SEGMENTS; i > 0; i--) ring.push(at(i, TILE_SEGMENTS));
  for (let j = TILE_SEGMENTS; j > 0; j--) ring.push(at(0, j));
  return ring;
}

const SKIRT_RING = skirtRing();

/** Triangle indices shared by every tile. */
export function tileIndices(): Uint16Array | Uint32Array {
  const indices: number[] = [];
  const at = (i: number, j: number) => j * SIDE + i;
  for (let j = 0; j < TILE_SEGMENTS; j++) {
    for (let i = 0; i < TILE_SEGMENTS; i++) {
      const a = at(i, j);
      const b = at(i + 1, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      // Counter-clockwise seen from above (+Y), with z growing "down" the grid.
      indices.push(a, c, b, b, c, d);
    }
  }
  const ringLength = SKIRT_RING.length;
  for (let k = 0; k < ringLength; k++) {
    const top0 = SKIRT_RING[k]!;
    const top1 = SKIRT_RING[(k + 1) % ringLength]!;
    const low0 = TILE_SURFACE_VERTICES + k;
    const low1 = TILE_SURFACE_VERTICES + ((k + 1) % ringLength);
    // Both windings: the skirt is seen from outside the tile.
    indices.push(top0, low0, top1, top1, low0, low1);
    indices.push(top0, top1, low0, top1, low1, low0);
  }
  return TILE_VERTICES > 65_535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

const sample = createTerrainSample();

/**
 * Samples the terrain for a tile centred on (centreX, centreZ) with the given
 * side length, in metres.
 */
export function buildTile(centreX: number, centreZ: number, size: number): TileData {
  const step = size / TILE_SEGMENTS;
  const half = size / 2;
  // Heights on a grid one cell wider on each side, for central-difference normals.
  const wide = SIDE + 2;
  const heights = new Float32Array(wide * wide);
  const waterWide = new Float32Array(wide * wide);
  for (let j = 0; j < wide; j++) {
    const z = centreZ - half + (j - 1) * step;
    for (let i = 0; i < wide; i++) {
      const x = centreX - half + (i - 1) * step;
      sampleTerrain(x, z, sample);
      heights[j * wide + i] = sample.height;
      waterWide[j * wide + i] = sample.water;
    }
  }

  const positions = new Float32Array(TILE_VERTICES * 3);
  const normals = new Float32Array(TILE_VERTICES * 3);
  const water = new Float32Array(TILE_VERTICES);
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const w = (j + 1) * wide + (i + 1);
      const h = heights[w]!;
      const v = j * SIDE + i;
      positions[v * 3] = -half + i * step;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = -half + j * step;

      const dx = (heights[w + 1]! - heights[w - 1]!) / (2 * step);
      const dz = (heights[w + wide]! - heights[w - wide]!) / (2 * step);
      const length = Math.hypot(dx, 1, dz);
      normals[v * 3] = -dx / length;
      normals[v * 3 + 1] = 1 / length;
      normals[v * 3 + 2] = -dz / length;
      water[v] = waterWide[w]!;

      if (h < minHeight) minHeight = h;
      if (h > maxHeight) maxHeight = h;
    }
  }

  // The skirt hangs below each edge vertex, deep enough to cover the largest
  // gap a neighbouring tile of half the detail could leave.
  const drop = size * 0.06 + 4;
  SKIRT_RING.forEach((top, k) => {
    const v = TILE_SURFACE_VERTICES + k;
    positions[v * 3] = positions[top * 3]!;
    positions[v * 3 + 1] = positions[top * 3 + 1]! - drop;
    positions[v * 3 + 2] = positions[top * 3 + 2]!;
    normals[v * 3] = normals[top * 3]!;
    normals[v * 3 + 1] = normals[top * 3 + 1]!;
    normals[v * 3 + 2] = normals[top * 3 + 2]!;
    water[v] = water[top]!;
  });

  return { positions, normals, water, minHeight, maxHeight };
}
