/**
 * The cloud deck of the final chapter.
 *
 * Two horizontal layers, anchored to the world. Coverage builds from a few
 * scattered clouds over the city to an unbroken deck in the last chapter.
 * While the camera is inside a layer, haze closes in on everything (the
 * aircraft climbing through cloud) and lifts again once it breaks out on top.
 */

import type { Atmosphere } from "./atmosphere";
import { clamp, lerp, smoothstep } from "./math";
import { REGION_COUNT, regionWeights } from "./terrain";

/** Elevations of the lower (main) and upper (wispy) layers, in metres. */
export const CLOUD_LAYERS = [1_300, 1_460] as const;

/** Fraction of sky each layer covers at full strength. */
export const CLOUD_COVER = { highlands: 0.82, city: 0.2 } as const;

const weights = new Array<number>(REGION_COUNT).fill(0);

/** Cloud cover, 0–1, at a route distance. */
export function cloudCover(distance: number): number {
  regionWeights(distance, weights);
  return clamp(weights[5]! * CLOUD_COVER.highlands + weights[4]! * CLOUD_COVER.city, 0, 0.95);
}

/** How deep inside the cloud deck the camera is, 0–1. */
export function cloudImmersion(cameraY: number, distance: number): number {
  const inside =
    smoothstep(CLOUD_LAYERS[0] - 110, CLOUD_LAYERS[0] - 10, cameraY) *
    (1 - smoothstep(CLOUD_LAYERS[1] + 10, CLOUD_LAYERS[1] + 110, cameraY));
  // Only a near-solid deck reads as being "in cloud".
  return inside * smoothstep(0.45, 0.75, cloudCover(distance));
}

/** Haze density inside cloud: a few hundred metres of visibility. */
const IN_CLOUD_DENSITY = 0.0024;

/**
 * Closes the haze in while the camera is inside cloud. Mutates the frame's
 * atmosphere after it has been computed for the flight progress.
 */
export function applyCloudImmersion(atmosphere: Atmosphere, cameraY: number, distance: number): void {
  const immersion = cloudImmersion(cameraY, distance);
  atmosphere.veil = immersion;
  if (immersion <= 0) return;
  atmosphere.fogDensity = lerp(atmosphere.fogDensity, IN_CLOUD_DENSITY, immersion);
  for (let i = 0; i < 3; i++) {
    // Sunlit cloud interior: the ambient sky tinted by the sun.
    const cloud = 0.42 * atmosphere.ambientSky[i]! + 0.22 * atmosphere.sunColor[i]!;
    atmosphere.fogColor[i] = lerp(atmosphere.fogColor[i]!, cloud, immersion);
  }
}

const f = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));

/** GLSL for cloud coverage; requires TERRAIN_GLSL for tRegionWeights. */
export const CLOUD_GLSL = /* glsl */ `
  float tCloudCover(float d) {
    float w[6];
    tRegionWeights(d, w);
    return clamp(w[5] * ${f(CLOUD_COVER.highlands)} + w[4] * ${f(CLOUD_COVER.city)}, 0.0, 0.95);
  }
`;
