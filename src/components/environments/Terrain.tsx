"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  type LightingUniforms,
  createLightingUniforms,
  updateLightingUniforms,
} from "@/components/flight/lightingUniforms";
import {
  LIGHTING_FUNCTIONS,
  LIGHTING_UNIFORMS,
  OUTPUT_CHUNKS,
} from "@/components/flight/shaders/lighting.glsl";
import {
  SHADOW_FAR_LAYER,
  SHADOW_GLSL,
  SHADOW_LAYER,
  invalidateSunShadows,
  shadowUniforms,
} from "@/components/flight/sunShadow";
import { flightFrame } from "@/flight/frame";
import { CITY_AXIS, CITY_GRID, TERRAIN_CONSTANTS, TERRAIN_GLSL } from "@/flight/terrain";
import { TILE_VERTICES, buildTile, tileIndices } from "@/flight/terrainTile";

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  attribute float aWater;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWater;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    // Tiles are only ever translated, so the normal needs no transform.
    vNormal = normal;
    vWater = aWater;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const C = TERRAIN_CONSTANTS;
const n = (value: number) => (Number.isInteger(value) ? `${value}.0` : String(value));

/** Pavement between the kerb and the building line; matches structures.ts. */
const SIDEWALK = 5;

const fragmentShader = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  ${SHADOW_GLSL}
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWater;
  ${TERRAIN_GLSL}
  ${LIGHTING_FUNCTIONS}

  const vec3 PAINT = vec3(0.6, 0.6, 0.56);

  // Metres per pixel at the shaded point. Detail smaller than a pixel or two
  // is not computed at all: from altitude most of the ground is far away,
  // and the shader would otherwise spend its time on cars and tree crowns
  // nobody can see.
  float gPixel;
  const vec3 ASPHALT = vec3(0.05, 0.052, 0.056);

  // 1 inside [lo, hi], antialiased over aa.
  float band(float x, float lo, float hi, float aa) {
    return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
  }

  // Farmland: parcels of different crops with hedgerows between them.
  vec3 farmland(vec2 p, float aa, float fine) {
    // The field pattern's orientation drifts across the country, and rows of
    // fields are staggered, so it never reads as a grid.
    float angle = 0.3 + 0.9 * (tNoise(p / 7000.0 + 3.0) - 0.5);
    float ca = cos(angle);
    float sa = sin(angle);
    vec2 q = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);
    float rowHeight = 150.0;
    float row = floor(q.y / rowHeight);
    float rowSeed = tHash(ivec2(int(row), 911));
    float width = 140.0 + 180.0 * rowSeed;
    q.x += rowSeed * 400.0;
    vec2 cell = vec2(floor(q.x / width), row);
    vec2 local = vec2(q.x - cell.x * width, q.y - row * rowHeight);
    vec2 size = vec2(width, rowHeight);
    float r = tHash(ivec2(cell) + ivec2(301, 77));
    vec3 crop;
    if (r < 0.32) crop = vec3(0.068, 0.1, 0.034);
    else if (r < 0.52) crop = vec3(0.1, 0.115, 0.045);
    else if (r < 0.66) crop = vec3(0.17, 0.15, 0.078);
    else if (r < 0.8) crop = vec3(0.12, 0.095, 0.064);
    else crop = vec3(0.082, 0.096, 0.042);
    // Drill rows, and the tramlines a sprayer leaves every couple of dozen metres.
    float rows = 0.5 + 0.5 * sin(local.x * (r > 0.66 ? 1.7 : 0.9));
    crop *= 0.93 + 0.1 * mix(rows, 0.5, smoothstep(0.4, 1.6, aa));
    float tram = 1.0 - band(fract(local.x / 24.0), 0.03, 0.97, aa / 24.0);
    crop *= 1.0 - 0.14 * tram * (1.0 - smoothstep(1.0, 4.0, aa)) * step(r, 0.66);
    crop *= 0.88 + 0.24 * fine;
    // Growth is never even across a field.
    crop *= 0.9 + 0.2 * tNoise(p / 37.0 + r * 50.0);
    // Hedgerows and tracks: thin, so they fade out once narrower than a pixel.
    float edge = min(min(local.x, size.x - local.x), min(local.y, size.y - local.y));
    float hedge = (1.0 - smoothstep(2.0, 2.0 + aa, edge)) * (1.0 - smoothstep(1.5, 5.0, aa));
    return mix(crop, vec3(0.03, 0.05, 0.02), hedge * 0.75);
  }

  // Tree crowns on a jittered grid. Returns coverage; writes the crown's
  // dome normal so each tree is lit on its sunny side.
  float canopy(vec2 p, float spacing, out vec2 lean) {
    lean = vec2(0.0);
    // Too small to see: the average cover of a stand of trees.
    if (gPixel > spacing * 0.8) return 0.6;
    vec2 g = p / spacing;
    vec2 cell = floor(g);
    float best = 9.0;
    vec2 bestOffset = vec2(0.0);
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 c = cell + vec2(float(i), float(j));
        ivec2 ic = ivec2(c);
        vec2 centre = c + 0.2 + 0.6 * vec2(tHash(ic), tHash(ic + ivec2(17, 3)));
        float radius = 0.42 + 0.3 * tHash(ic + ivec2(5, 29));
        vec2 offset = (g - centre) / radius;
        float dist = dot(offset, offset);
        if (dist < best) {
          best = dist;
          bestOffset = offset;
        }
      }
    }
    lean = bestOffset * (1.0 - smoothstep(0.85, 1.0, best));
    return 1.0 - smoothstep(0.8, 1.0, best);
  }

  // One tree of a planted row: q is the position relative to the row's line
  // (x across it, y along it), with trees every 'spacing' metres.
  float rowTree(vec2 q, float spacing, float aa, out vec2 lean) {
    lean = vec2(0.0);
    if (aa > 5.0 || abs(q.x) > 4.0) return 0.0;
    float index = floor(q.y / spacing);
    float r = tHash(ivec2(int(index), 733));
    vec2 offset = vec2(q.x, q.y - (index + 0.5) * spacing) / (2.4 + 1.3 * r);
    float dist = dot(offset, offset);
    lean = offset * (1.0 - smoothstep(0.8, 1.0, dist));
    return (1.0 - smoothstep(0.75, 1.0, dist)) * step(0.12, r);
  }

  // Small wind-driven ripples, calmer with distance. 'flow' drifts them.
  vec3 waterNormal(vec2 p, float viewDistance, vec2 flow) {
    vec2 q = p / 7.0 + flow;
    float e = 0.2;
    float h0 = tNoise(q) + 0.5 * tNoise(q * 2.7 + 3.1 - flow * 1.7);
    float hx = tNoise(q + vec2(e, 0.0)) + 0.5 * tNoise((q + vec2(e, 0.0)) * 2.7 + 3.1 - flow * 1.7);
    float hz = tNoise(q + vec2(0.0, e)) + 0.5 * tNoise((q + vec2(0.0, e)) * 2.7 + 3.1 - flow * 1.7);
    float amplitude = 0.02 + 0.2 * (1.0 - smoothstep(200.0, 2000.0, viewDistance));
    return normalize(vec3((h0 - hx) * amplitude * 2.5, 1.0, (h0 - hz) * amplitude * 2.5));
  }

  // Vehicles in one lane. s: offset from the lane's centre, t: distance along
  // it. Returns coverage and writes the paint colour.
  float vehicles(float s, float t, float lane, float density, float spacing, float aa, out vec3 paint) {
    paint = vec3(0.0);
    if (aa > 3.2 || abs(s) > 1.4) return 0.0;
    float cell = floor(t / spacing);
    ivec2 id = ivec2(int(cell), int(lane) * 131 + 7);
    float r = tHash(id);
    float tone = tHash(id + ivec2(11, 5));
    paint = tone < 0.3 ? vec3(0.62, 0.63, 0.64)
      : tone < 0.5 ? vec3(0.3, 0.31, 0.33)
      : tone < 0.66 ? vec3(0.035, 0.035, 0.04)
      : tone < 0.78 ? vec3(0.36, 0.05, 0.04)
      : tone < 0.9 ? vec3(0.05, 0.1, 0.24)
      : vec3(0.5, 0.42, 0.3);
    if (r > density) return 0.0;
    float lorry = step(0.9, tHash(id + ivec2(3, 19)));
    float len = mix(4.5, 11.0, lorry);
    float halfWidth = mix(0.92, 1.25, lorry);
    float along = t - (cell + 0.5) * spacing - (tHash(id + ivec2(7, 2)) - 0.5) * (spacing - len - 3.0);
    float body = band(along, -len * 0.5, len * 0.5, aa) * band(s, -halfWidth, halfWidth, aa);
    // A darker glasshouse over the middle of a car.
    paint *= 1.0 - 0.55 * (1.0 - lorry) * band(along, -1.0, 0.9, aa) * (1.0 - smoothstep(0.2, 0.6, aa));
    return body * (1.0 - smoothstep(1.4, 3.2, aa));
  }

  // A country road: s is the distance from its centreline, t the distance
  // along it, hw the half-width of the carriageway. Returns colour and cover.
  vec4 countryRoad(float s, float t, float hw, float aa, float fine) {
    float a = abs(s);
    float cover = 1.0 - smoothstep(hw + 1.4 - aa, hw + 1.4 + aa, a);
    if (cover <= 0.0) return vec4(0.0);
    vec3 verge = vec3(0.19, 0.17, 0.13) * (0.85 + 0.3 * fine);
    vec3 surface = ASPHALT * (0.9 + 0.22 * fine);
    // Wheel tracks polish the surface a little lighter.
    surface *= 1.0 + 0.1 * band(abs(a - hw * 0.5), 0.0, 0.5, aa + 0.2);
    vec3 color = mix(surface, verge, smoothstep(hw - aa, hw + aa, a));
    float paintVisible = 1.0 - smoothstep(0.8, 2.6, aa);
    float lines = band(a, hw - 0.6, hw - 0.4, aa) + band(a, 0.0, 0.1, aa) * step(0.4, fract(t / 12.0));
    color = mix(color, PAINT, clamp(lines, 0.0, 1.0) * paintVisible);
    vec3 paint;
    float dir = s > 0.0 ? 1.0 : -1.0;
    float car = vehicles(a - hw * 0.5, t + dir * uTime * 19.0, 3.0 + dir, 0.1, 90.0, aa, paint);
    color = mix(color, paint, car);
    return vec4(color, cover);
  }

  // A dual carriageway with a planted central reservation.
  vec4 trunkRoad(float s, float t, float aa, float fine) {
    float a = abs(s);
    float hw = 11.0;
    float cover = 1.0 - smoothstep(hw + 2.0 - aa, hw + 2.0 + aa, a);
    if (cover <= 0.0) return vec4(0.0);
    vec3 surface = ASPHALT * (0.9 + 0.22 * fine);
    vec3 color = mix(surface, vec3(0.17, 0.16, 0.13) * (0.85 + 0.3 * fine), smoothstep(hw - aa, hw + aa, a));
    // Central reservation: grass behind a crash barrier.
    color = mix(color, vec3(0.06, 0.09, 0.035), 1.0 - smoothstep(1.3 - aa, 1.3 + aa, a));
    float paintVisible = 1.0 - smoothstep(0.8, 2.6, aa);
    float lines = band(a, 1.6, 1.8, aa) + band(a, hw - 0.65, hw - 0.45, aa)
      + band(a, 6.05, 6.2, aa) * step(0.5, fract(t / 14.0));
    color = mix(color, PAINT, clamp(lines, 0.0, 1.0) * paintVisible);
    float dir = s > 0.0 ? 1.0 : -1.0;
    vec3 paint;
    float car = vehicles(a - 4.0, t + dir * uTime * 27.0, 10.0 + dir, 0.34, 46.0, aa, paint);
    color = mix(color, paint, car);
    car = vehicles(a - 8.2, t + dir * uTime * 22.0, 20.0 + dir, 0.42, 58.0, aa, paint);
    color = mix(color, paint, car);
    return vec4(color, cover);
  }

  // The carriageway of one city street. across: offset from its centreline;
  // along: distance along it (continuous through the grid); inBlock: the same
  // measured from the start of this block; width: kerb to kerb half-width;
  // crossing: width of the street it meets at each end of the block.
  vec4 cityStreet(float across, float along, float inBlock, float hw, float crossing, float aa, float fine) {
    float a = abs(across);
    float cover = 1.0 - smoothstep(hw - aa, hw + aa, a);
    if (cover <= 0.0) return vec4(0.0);
    vec3 color = ASPHALT * (0.92 + 0.2 * fine) * (0.92 + 0.16 * tNoise(vec2(across, along) * vec2(0.6, 0.05)));
    bool avenue = hw > 10.0;
    float paintVisible = 1.0 - smoothstep(0.7, 2.4, aa);
    // Between junctions: lane lines. At each end: a stop line and a crossing.
    float B = ${n(C.cityBlock)};
    float clearOfJunction = band(inBlock, crossing + 7.0, B - 7.0, aa);
    float dash = step(0.45, fract(along / 9.0));
    float lines;
    if (avenue) {
      lines = band(a, 4.5, 4.66, aa) * dash + band(a, 7.9, 8.06, aa) * dash + band(a, 11.2, 11.38, aa)
        + band(a, 1.25, 1.42, aa);
    } else {
      lines = band(a, 0.0, 0.09, aa) * dash + band(a, 4.5, 4.62, aa);
    }
    color = mix(color, PAINT, clamp(lines, 0.0, 1.0) * clearOfJunction * paintVisible);
    float zebra = (band(inBlock, crossing + 1.0, crossing + 4.4, aa) + band(inBlock, B - 4.4, B - 1.0, aa))
      * step(0.5, fract(across / 1.1)) * (avenue ? step(1.3, a) : 1.0);
    float stopLine = (band(inBlock, crossing + 5.6, crossing + 6.0, aa) * step(0.0, across)
      + band(inBlock, B - 6.0, B - 5.6, aa) * step(across, 0.0)) * (avenue ? step(1.3, a) : 1.0);
    color = mix(color, PAINT, clamp(zebra + stopLine, 0.0, 1.0) * paintVisible);
    if (avenue) {
      // A planted median between junctions.
      float median = (1.0 - smoothstep(1.2 - aa, 1.2 + aa, a)) * clearOfJunction;
      vec2 lean;
      float tree = rowTree(vec2(across, along), 13.0, aa, lean);
      color = mix(color, vec3(0.07, 0.1, 0.04), median);
      color = mix(color, vec3(0.03, 0.06, 0.025) * (1.0 + 0.5 * dot(lean, uSunDirection.xz)), tree * clearOfJunction);
    }
    // Traffic, and cars parked at the kerb on the smaller streets.
    float dir = across > 0.0 ? 1.0 : -1.0;
    vec3 paint;
    if (avenue) {
      float car = vehicles(a - 2.9, along + dir * uTime * 13.0, 30.0 + dir, 0.34, 24.0, aa, paint);
      color = mix(color, paint, car * clearOfJunction);
      car = vehicles(a - 6.3, along + dir * uTime * 11.0, 40.0 + dir, 0.4, 21.0, aa, paint);
      color = mix(color, paint, car * clearOfJunction);
      car = vehicles(a - 9.6, along + dir * uTime * 9.0, 50.0 + dir, 0.3, 27.0, aa, paint);
      color = mix(color, paint, car * clearOfJunction);
    } else {
      float car = vehicles(a - 2.3, along + dir * uTime * 9.0, 60.0 + dir, 0.2, 30.0, aa, paint);
      color = mix(color, paint, car * clearOfJunction);
      car = vehicles(a - 5.8, along, 70.0 + dir, 0.62, 6.2, aa, paint);
      color = mix(color, paint, car * band(inBlock, crossing + 9.0, B - 9.0, aa));
    }
    return vec4(color, cover);
  }

  // Rows of parking bays with cars in most of them. q in metres.
  vec3 carPark(vec2 q, float aa, float fine, float seed) {
    // From altitude: asphalt flecked with the colours of parked cars.
    if (aa > 3.2) return vec3(0.12, 0.122, 0.126) * (0.9 + 0.2 * fine);
    vec3 color = vec3(0.075, 0.077, 0.08) * (0.9 + 0.2 * fine);
    // Across the rows: a bay, the aisle, a bay; repeated.
    float row = floor(q.y / 16.5);
    float y = q.y - row * 16.5;
    float bay = (1.0 - step(5.0, y)) + step(11.5, y);
    float paintVisible = 1.0 - smoothstep(0.6, 2.0, aa);
    float line = (1.0 - band(fract(q.x / 2.6), 0.04, 0.96, aa / 2.6)) * bay;
    color = mix(color, PAINT, line * paintVisible * 0.8);
    float side = step(11.5, y);
    float inBay = side > 0.5 ? y - 14.0 : y - 2.5;
    vec3 paint;
    // One car to a bay: hash the bay itself rather than a lane position.
    ivec2 id = ivec2(int(floor(q.x / 2.6)), int(row * 2.0 + side) + int(seed * 977.0));
    float taken = step(tHash(id), 0.58) * bay;
    float tone = tHash(id + ivec2(5, 3));
    paint = tone < 0.3 ? vec3(0.62, 0.63, 0.64) : tone < 0.52 ? vec3(0.28, 0.29, 0.31)
      : tone < 0.7 ? vec3(0.035, 0.035, 0.04) : tone < 0.82 ? vec3(0.36, 0.05, 0.04)
      : tone < 0.92 ? vec3(0.05, 0.1, 0.24) : vec3(0.5, 0.42, 0.3);
    float car = band(fract(q.x / 2.6) * 2.6, 0.35, 2.25, aa) * band(inBay, -2.1, 2.1, aa) * taken;
    paint *= 1.0 - 0.5 * band(inBay, -0.9, 0.8, aa) * (1.0 - smoothstep(0.2, 0.6, aa));
    return mix(color, paint, car * (1.0 - smoothstep(1.4, 3.2, aa)));
  }

  void main() {
    vec2 p = vWorld.xz;
    float d = -p.y;
    float w[6];
    tRegionWeights(d, w);
    float lateral = p.x - tRouteLateral(max(d, 0.0));
    vec3 toCamera = cameraPosition - vWorld;
    float viewDistance = length(toCamera);
    vec3 V = toCamera / viewDistance;
    vec3 N = normalize(vNormal);
    float slope = 1.0 - N.y;
    float h = vWorld.y;
    // Metres covered by one pixel, for antialiasing linear features.
    float aa = max(max(fwidth(p.x), fwidth(p.y)), 0.02);
    gPixel = aa;
    vec2 sunAcross = normalize(uSunDirection.xz + vec2(1e-5));

    float broad = tFbm(p / 1800.0, 3);
    float mid = tFbm(p / 240.0 + 7.0, 3);
    float fine = mix(tNoise(p / 5.0), 0.5, smoothstep(0.6, 2.2, aa));

    // ---- Natural ground cover ---------------------------------------------
    vec3 grass = mix(vec3(0.045, 0.08, 0.024), vec3(0.09, 0.115, 0.036), smoothstep(0.35, 0.65, broad));
    grass = mix(grass, vec3(0.15, 0.135, 0.07), smoothstep(0.62, 0.85, mid) * 0.35);
    // The tropical coast is lusher.
    grass = mix(grass, grass * vec3(0.82, 1.14, 0.78), w[0]);
    vec3 rock = mix(vec3(0.15, 0.14, 0.13), vec3(0.25, 0.23, 0.2), mid);
    vec3 forestColor = mix(vec3(0.024, 0.048, 0.02), vec3(0.04, 0.068, 0.027), broad);
    vec3 lawn = vec3(0.065, 0.105, 0.035) * (0.9 + 0.2 * fine);

    float industrialKind = 0.0;
    vec2 plotLocal = vec2(0.0);
    if (w[2] > 0.001) {
      ivec2 plot = ivec2(floor(p / ${n(C.industrialPlot)}));
      industrialKind = tIndustrialPlot(plot);
      plotLocal = p - vec2(plot) * ${n(C.industrialPlot)};
    }

    float forest = 0.0;
    float farm = 0.0;
    forest += w[0] * smoothstep(0.5, 0.6, tFbm(p / 900.0 + 13.0, 3)) * smoothstep(8.0, 30.0, h);
    farm += w[0] * (1.0 - smoothstep(0.04, 0.09, slope)) * (1.0 - smoothstep(40.0, 90.0, h));
    forest += w[1] * smoothstep(0.03, 0.12, slope) * (1.0 - smoothstep(950.0, 1250.0, h + 120.0 * mid));
    farm += w[1] * (1.0 - smoothstep(0.02, 0.05, slope)) * (1.0 - smoothstep(70.0, 110.0, h));
    forest += w[3] * smoothstep(0.48, 0.56, tFbm(p / 800.0 + 3.0, 3)) * (1.0 - smoothstep(0.35, 0.55, slope));
    farm += w[3] * (1.0 - smoothstep(0.03, 0.07, slope)) * (1.0 - smoothstep(90.0, 160.0, h));
    forest += w[5] * smoothstep(0.5, 0.58, tFbm(p / 1100.0 + 9.0, 3)) * (1.0 - smoothstep(700.0, 1000.0, h));
    farm += w[5] * 0.6 * (1.0 - smoothstep(0.03, 0.07, slope)) * (1.0 - smoothstep(250.0, 400.0, h));
    float woodlot = smoothstep(0.62, 0.68, tFbm(p / 700.0 + 21.0, 3));
    forest += (w[2] + w[4]) * woodlot;
    farm += w[2] * (industrialKind < 0.5 ? 1.0 : 0.0) * (1.0 - woodlot);
    forest = clamp(forest, 0.0, 1.0);
    farm = clamp(farm, 0.0, 1.0) * (1.0 - forest);

    vec3 albedo = grass;
    if (farm > 0.01) albedo = mix(albedo, farmland(p, aa, fine), farm);

    // Painted relief: how far a shadow reaches per metre of height, so flat
    // details (houses, hedges) can throw a short shadow of their own.
    float shadowReach = min(1.0 / max(uSunDirection.y, 0.12), 6.0) * sqrt(max(1.0 - uSunDirection.y * uSunDirection.y, 0.0));

    // Villages: clusters of houses among the fields.
    float rural = clamp(w[0] + w[1] + w[3] + w[5] * 0.6, 0.0, 1.0) * farm;
    if (rural > 0.05) {
      vec2 cell = floor(p / 900.0);
      ivec2 ic = ivec2(cell);
      if (tHash(ic + ivec2(4, 71)) < 0.32) {
        vec2 centre = (cell + 0.25 + 0.5 * vec2(tHash(ic + ivec2(9, 2)), tHash(ic + ivec2(3, 8)))) * 900.0;
        float radius = 90.0 + 110.0 * tHash(ic + ivec2(6, 6));
        float inVillage = 1.0 - smoothstep(radius * 0.7, radius, length(p - centre) + 40.0 * (mid - 0.5));
        if (inVillage > 0.0) {
          float resolved = 1.0 - smoothstep(2.0, 6.0, aa);
          vec3 village = grass * 1.05;
          // Lanes between the plots.
          vec2 lane = abs(fract(p / 54.0) - 0.5) * 54.0;
          village = mix(village, vec3(0.2, 0.18, 0.15), (1.0 - smoothstep(1.6, 1.6 + aa, min(lane.x, lane.y))) * resolved);
          vec3 roofColor = vec3(0.0);
          float house = 0.0;
          float shade = 0.0;
          // The house on this plot, and the shadow of the one up-sun of it.
          for (int k = 0; k < 2; k++) {
            vec2 q = p + (k == 1 ? sunAcross * (5.5 * shadowReach) : vec2(0.0));
            vec2 lot = floor(q / 18.0);
            vec2 inLot = q - lot * 18.0;
            float r = tHash(ivec2(lot) + ic * 7);
            float turned = step(0.5, tHash(ivec2(lot) + ivec2(31, 5)));
            vec2 halfSize = mix(vec2(5.2, 3.6), vec2(3.6, 5.2), turned);
            vec2 fromCentre = inLot - 9.0;
            float body = band(fromCentre.x, -halfSize.x, halfSize.x, aa) * band(fromCentre.y, -halfSize.y, halfSize.y, aa)
              * step(0.35, r);
            if (k == 0) {
              house = body;
              roofColor = r < 0.6 ? vec3(0.27, 0.12, 0.075) : r < 0.85 ? vec3(0.2, 0.19, 0.18) : vec3(0.34, 0.33, 0.31);
              // A pitched roof: the slope facing the sun is the brighter one.
              float across = turned > 0.5 ? fromCentre.x : fromCentre.y;
              float towardSun = (turned > 0.5 ? sunAcross.x : sunAcross.y) * sign(across);
              roofColor *= 1.0 + 0.42 * towardSun * resolved;
              roofColor *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.5 + aa, abs(across))) * resolved;
            } else {
              shade = body;
            }
          }
          village *= 1.0 - 0.5 * shade * (1.0 - house) * resolved * uShadowParams.x;
          village = mix(village, roofColor, house * resolved + 0.25 * (1.0 - resolved) * house);
          albedo = mix(albedo, village, inVillage * rural);
        }
      }
    }
    albedo = mix(albedo, forestColor, forest);

    // Rock on steep or high ground, snow on the highest peaks.
    float rocky = clamp(
      smoothstep(0.38, 0.55, slope + 0.06 * (mid - 0.5)) + smoothstep(1350.0, 1750.0, h + 150.0 * mid),
      0.0, 1.0);
    // Strata: rock faces are banded along the contour.
    vec3 strata = rock * (0.72 + 0.3 * tNoise(vec2(h / 9.0 + 4.0 * mid, dot(p, vec2(0.004, 0.003)))));
    albedo = mix(albedo, strata, rocky);
    // Scree and thin grass where the slope eases below a rock face.
    float scree = smoothstep(0.26, 0.4, slope + 0.1 * (mid - 0.5)) * (1.0 - rocky);
    albedo = mix(albedo, mix(albedo, rock, 0.55), scree * 0.6);
    float snow = smoothstep(2250.0, 2450.0, h + 250.0 * mid) * (1.0 - smoothstep(0.45, 0.65, slope));
    albedo = mix(albedo, vec3(0.74, 0.76, 0.8), snow);
    forest *= 1.0 - rocky;

    // Detail at several scales, each dropped once it is smaller than a few
    // pixels, so the ground has texture from any altitude without shimmering.
    float detail = 0.0;
    detail += (tNoise(p / 95.0 + 1.7) - 0.5) * (1.0 - smoothstep(12.0, 30.0, aa));
    detail += (tNoise(p / 28.0 + 5.1) - 0.5) * 0.8 * (1.0 - smoothstep(4.0, 9.0, aa));
    albedo *= 1.0 + 0.32 * detail;
    albedo *= 0.86 + 0.28 * fine;

    // Individual tree crowns, lit on their sunny side, where they are big enough to see.
    vec3 shadingNormal = N;
    if (forest > 0.05 && viewDistance < 5000.0) {
      vec2 lean;
      float crown = canopy(p, 7.5, lean);
      float visible = forest * (1.0 - smoothstep(2500.0, 5000.0, viewDistance));
      albedo *= mix(1.0, mix(0.52, 1.1, crown), visible);
      shadingNormal = normalize(N + vec3(lean.x, 0.0, lean.y) * (0.9 * visible));
    }

    // ---- Roads -------------------------------------------------------------
    vec3 asphalt = ASPHALT * (0.9 + 0.2 * fine);
    vec4 road = vec4(0.0);
    if (w[1] > 0.001) {
      vec4 r = countryRoad(lateral - tValleyRiver(d) - 120.0, d, 3.6, aa, fine);
      road = mix(road, r, r.a * w[1]);
    }
    if (w[2] > 0.001) {
      vec4 r = trunkRoad(lateral - 300.0, d, aa, fine);
      road = mix(road, r, r.a * w[2]);
    }
    if (w[3] > 0.001) {
      float field = tFbm(p / 5000.0 + 70.0, 3);
      float gradient = max(fwidth(field) / aa, 1e-7);
      vec4 r = countryRoad((field - 0.5) / gradient, p.x + p.y, 3.4, aa, fine);
      road = mix(road, r, r.a * w[3] * (1.0 - smoothstep(0.2, 0.3, slope)));
    }

    // ---- Coast: beach, airfield -------------------------------------------
    float sea = 0.0;
    float inland = 1e5;
    if (w[0] > 0.001) {
      inland = p.x - tCoastline(d);
      float airfield = tAirfield(p);
      float beach = smoothstep(-8.0, 0.0, inland) * (1.0 - smoothstep(40.0, 140.0 + 60.0 * mid, inland))
        * (1.0 - smoothstep(2.0, 5.0, h));
      // Dry sand above the tide line, darker wet sand below it.
      vec3 sand = mix(vec3(0.3, 0.27, 0.21), vec3(0.5, 0.45, 0.34), smoothstep(6.0, 22.0, inland + 8.0 * mid));
      albedo = mix(albedo, sand * (0.9 + 0.2 * fine), beach * w[0] * (1.0 - airfield));
      sea = w[0] * (1.0 - smoothstep(-6.0, 6.0, inland)) * (1.0 - airfield);
      vec4 r = countryRoad(inland - 380.0, d, 3.6, aa, fine);
      road = mix(road, r, r.a * w[0] * (1.0 - airfield));

      if (airfield > 0.001) {
        // Mown grass along the runway strip, striped by the mower.
        float strip = (1.0 - smoothstep(40.0, 260.0, abs(p.x))) * band(p.y, -3000.0, 300.0, 40.0);
        vec3 mown = vec3(0.07, 0.098, 0.036) * (0.9 + 0.2 * fine)
          * (1.0 + 0.07 * (step(0.5, fract(p.x / 14.0)) - 0.5) * (1.0 - smoothstep(2.0, 7.0, aa)));
        albedo = mix(albedo, mown, strip * 0.5 * airfield);
        // Parallel taxiway, its links to the runway, and the apron.
        float taxiway = band(p.x, 168.5, 191.5, aa) * band(p.y, -2962.0, 72.0, aa);
        float links = (band(p.y, 48.5, 71.5, aa) + band(p.y, -1461.5, -1438.5, aa) + band(p.y, -2961.5, -2938.5, aa))
          * band(p.x, 22.0, 185.0, aa);
        float apron = band(p.x, 191.0, 560.0, aa) * band(p.y, -1700.0, -1150.0, aa);
        // Hardstanding in front of the hangars, and the road to the terminal.
        float hardstand = band(p.x, 191.0, 520.0, aa) * band(p.y, -2290.0, -1990.0, aa);
        float landside = band(p.x, 672.0, 700.0, aa) * band(p.y, -2300.0, -900.0, aa);
        float paved = clamp(taxiway + links + apron + hardstand + landside, 0.0, 1.0);
        // Concrete laid in bays, with sealed joints and the stains of use.
        vec3 concrete = vec3(0.15, 0.15, 0.146) * (0.85 + 0.3 * tNoise(p / 3.0));
        vec2 joint = abs(fract(p / 7.5) - 0.5) * 7.5;
        concrete *= 1.0 - 0.25 * (1.0 - smoothstep(0.08, 0.08 + aa, min(joint.x, joint.y))) * (1.0 - smoothstep(0.5, 2.0, aa));
        concrete *= 0.86 + 0.2 * tNoise(p / 19.0 + 3.0);
        vec3 pavement = mix(asphalt, concrete, clamp(apron + hardstand, 0.0, 1.0));
        float paintVisible = 1.0 - smoothstep(1.0, 3.0, aa);
        float centreline = band(abs(p.x - 180.0), 0.0, 0.25, aa * 0.5) * band(p.y, -2950.0, 60.0, aa);
        // Lead-in lines to the stands, and each stand's stop bar.
        float standZ = abs(fract((p.y + 1190.0) / 120.0) - 0.5) * 120.0;
        float stand = band(standZ, 0.0, 0.22, aa * 0.5) * band(p.x, 215.0, 520.0, aa) * apron;
        float edgeLine = band(abs(p.x - 180.0), 10.3, 10.6, aa * 0.5) * taxiway;
        pavement = mix(pavement, vec3(0.5, 0.38, 0.07), clamp(centreline + stand + edgeLine, 0.0, 1.0) * paintVisible);
        albedo = mix(albedo, pavement, paved * airfield);
        // Car park beyond the terminal.
        float parking = band(p.x, 706.0, 800.0, aa) * band(p.y, -1640.0, -1220.0, aa);
        if (parking > 0.0) albedo = mix(albedo, carPark(p.yx - vec2(-1640.0, 706.0), aa, fine, 0.3), parking * airfield);
      }
    }

    // ---- Industrial plain ---------------------------------------------------
    if (w[2] > 0.001) {
      if (industrialKind > 0.5) {
        float P = ${n(C.industrialPlot)};
        vec3 ground = industrialKind < 1.5 ? vec3(0.17, 0.165, 0.155)
          : industrialKind < 2.5 ? vec3(0.085, 0.087, 0.09)
          : vec3(0.19, 0.185, 0.175);
        ground *= 0.84 + 0.26 * tNoise(p / 23.0) + 0.08 * fine;
        // Slabs cast in bays, tyre-polished where vehicles turn.
        vec2 joint = abs(fract(plotLocal / 9.2) - 0.5) * 9.2;
        ground *= 1.0 - 0.2 * (1.0 - smoothstep(0.1, 0.1 + aa, min(joint.x, joint.y))) * (1.0 - smoothstep(0.6, 2.4, aa));
        ground *= 0.9 + 0.16 * tNoise(plotLocal / 61.0 + industrialKind * 9.0);
        vec2 site = plotLocal - 22.0;
        float span = P - 44.0;
        float paintVisible = 1.0 - smoothstep(0.6, 2.2, aa);
        if (industrialKind < 1.5) {
          // Staff car park beside the offices.
          float parking = band(site.x, span * 0.64, span * 0.99, aa) * band(site.y, span * 0.25, span * 0.37, aa);
          if (parking > 0.0) ground = mix(ground, carPark(site - vec2(span * 0.64, span * 0.25), aa, fine, 0.6), parking);
        } else if (industrialKind < 2.5) {
          // Painted lanes of the container stack.
          float lanes = (1.0 - band(fract((site.y - span * 0.48 + 5.5) / 11.0), 0.02, 0.98, aa / 11.0))
            * band(site.y, span * 0.46, span * 0.98, aa) * band(site.x, 12.0, span - 12.0, aa);
          ground = mix(ground, vec3(0.5, 0.4, 0.08), lanes * paintVisible * 0.7);
        } else {
          // Dock aprons: a bay line for every trailer.
          float bays = (1.0 - band(fract(site.x / 4.0), 0.03, 0.97, aa / 4.0))
            * band(fract((site.y - 40.0) / (span / 2.5)) * (span / 2.5), 28.0, 46.0, aa)
            * band(site.x, span * 0.2, span * 0.8, aa);
          ground = mix(ground, PAINT, bays * paintVisible * 0.5);
        }
        float edge = min(min(plotLocal.x, P - plotLocal.x), min(plotLocal.y, P - plotLocal.y));
        // Verge, security fence line, then the yard.
        vec3 plotColor = mix(grass * 0.9, ground, smoothstep(13.0, 15.0, edge));
        plotColor = mix(plotColor, vec3(0.1), band(edge, 13.2, 13.5, aa) * (1.0 - smoothstep(0.4, 1.4, aa)) * 0.7);
        // Estate road round the plot, with its edge line.
        vec3 estate = asphalt;
        estate = mix(estate, PAINT, band(edge, 10.3, 10.5, aa) * paintVisible);
        plotColor = mix(plotColor, estate, band(edge, 2.0, 11.0, aa));
        albedo = mix(albedo, plotColor, w[2]);
        forest = 0.0;
      }
      // A double-track railway on its ballast.
      float railAcross = abs(lateral + 650.0);
      float ballast = 1.0 - smoothstep(5.5 - aa, 5.5 + aa, railAcross);
      vec3 track = vec3(0.13, 0.115, 0.1) * (0.8 + 0.4 * fine);
      float sleepers = step(0.5, fract(d / 1.4)) * band(abs(railAcross - 2.2), 0.0, 1.25, aa) * (1.0 - smoothstep(0.25, 0.8, aa));
      track = mix(track, vec3(0.07, 0.06, 0.05), sleepers * 0.6);
      float rails = band(abs(abs(railAcross - 2.2) - 0.72), 0.0, 0.07, aa);
      track = mix(track, vec3(0.3, 0.29, 0.28), rails * (1.0 - smoothstep(0.5, 2.0, aa)));
      albedo = mix(albedo, track, ballast * w[2]);
    }

    // ---- City ---------------------------------------------------------------
    float urban = w[4] * (1.0 - smoothstep(3800.0, 6200.0, abs(lateral - ${n(CITY_AXIS)})));
    if (urban > 0.001) {
      float B = ${n(C.cityBlock)};
      vec2 g = tToCityGrid(p);
      vec2 cell = floor(g / B);
      vec2 local = g - cell * B;
      ivec2 ic = ivec2(cell);
      float streetX = mod(cell.x, ${n(C.cityAvenueEvery)}) < 0.5 ? ${n(C.cityAvenue)} : ${n(C.cityStreet)};
      float streetY = mod(cell.y, ${n(C.cityAvenueEvery)}) < 0.5 ? ${n(C.cityAvenue)} : ${n(C.cityStreet)};
      bool park = tHash(ic + ivec2(55, 0)) < ${n(C.parkShare)};

      // Is this block built up with geometry, or suburbs drawn as roofs?
      vec2 centreGrid = (cell + 0.5) * B;
      float cc = ${n(Math.cos(CITY_GRID.angle))};
      float ss = ${n(Math.sin(CITY_GRID.angle))};
      vec2 centre = vec2(cc * centreGrid.x + ss * centreGrid.y, -ss * centreGrid.x + cc * centreGrid.y);
      float centreLateral = centre.x - tRouteLateral(max(-centre.y, 0.0));
      float core = tDowntown(centre, centreLateral);
      bool suburb = core < 0.03 && abs(centreLateral - 300.0) > 2200.0;
      float resolved = 1.0 - smoothstep(1.5, 5.0, aa);

      // Footway: paving flags with a kerb at the carriageway.
      vec3 pavement = vec3(0.19, 0.187, 0.178) * (0.86 + 0.28 * tNoise(g / 7.0));
      vec2 flag = abs(fract(g / 1.8) - 0.5) * 1.8;
      pavement *= 1.0 - 0.14 * (1.0 - smoothstep(0.03, 0.03 + aa, min(flag.x, flag.y))) * (1.0 - smoothstep(0.15, 0.6, aa));
      vec3 blockColor = pavement;

      // The buildable rectangle of the block, in metres from its centre.
      vec2 lotSize = vec2(B - streetX, B - streetY) - ${n(2 * SIDEWALK)};
      vec2 lot = local - vec2(streetX, streetY) - ${n(SIDEWALK)} - lotSize * 0.5;
      float inLot = band(lot.x, -lotSize.x * 0.5, lotSize.x * 0.5, aa) * band(lot.y, -lotSize.y * 0.5, lotSize.y * 0.5, aa);
      float seed = tHash(ic + ivec2(7, 91));

      if (park) {
        // Lawns, winding paths, a pond, and trees thickening toward the edges.
        vec3 green = lawn * (1.0 + 0.12 * (step(0.5, fract((lot.x + lot.y) / 9.0)) - 0.5) * resolved);
        float pathField = tNoise(g / 46.0 + seed * 20.0);
        float path = 1.0 - smoothstep(1.4, 1.4 + aa, abs(pathField - 0.5) / max(fwidth(pathField) / aa, 1e-5));
        green = mix(green, vec3(0.34, 0.31, 0.25), path * resolved);
        vec2 pondAt = (vec2(seed, tHash(ic + ivec2(2, 17))) - 0.5) * 40.0;
        float pond = 1.0 - smoothstep(13.0, 14.0 + aa, length((lot - pondAt) * vec2(1.0, 1.5)) + 5.0 * tNoise(g / 11.0));
        vec2 lean;
        float crown = canopy(g + 3.0, 8.5, lean) * smoothstep(0.42, 0.62, tNoise(g / 30.0 + 7.0)) * (1.0 - pond);
        green = mix(green, vec3(0.03, 0.058, 0.024) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * resolved);
        green = mix(green, vec3(0.02, 0.045, 0.05), pond);
        blockColor = mix(pavement, green, inLot);
      } else if (suburb) {
        // Suburbs: houses on small lots with gardens and a drive.
        vec3 garden = grass * 0.95 * (0.9 + 0.2 * tNoise(g / 4.0));
        vec3 roofColor = vec3(0.0);
        float house = 0.0;
        float shade = 0.0;
        for (int k = 0; k < 2; k++) {
          vec2 q = local + (k == 1 ? vec2(cc * sunAcross.x - ss * sunAcross.y, ss * sunAcross.x + cc * sunAcross.y) * (5.5 * shadowReach) : vec2(0.0));
          vec2 plot = floor(q / 16.0);
          vec2 inPlot = q - plot * 16.0;
          float r = tHash(ivec2(plot) + ic * 13);
          float turned = step(0.5, tHash(ivec2(plot) + ic * 5 + ivec2(3, 1)));
          vec2 halfSize = mix(vec2(5.0, 3.6), vec2(3.6, 5.0), turned);
          vec2 fromCentre = inPlot - 8.0;
          float body = band(fromCentre.x, -halfSize.x, halfSize.x, aa) * band(fromCentre.y, -halfSize.y, halfSize.y, aa)
            * step(0.15, r);
          if (k == 0) {
            house = body;
            roofColor = r < 0.45 ? vec3(0.25, 0.11, 0.075) : r < 0.8 ? vec3(0.17, 0.17, 0.175) : vec3(0.09, 0.09, 0.095);
            float across = turned > 0.5 ? fromCentre.x : fromCentre.y;
            vec2 gridSun = vec2(cc * sunAcross.x - ss * sunAcross.y, ss * sunAcross.x + cc * sunAcross.y);
            float towardSun = (turned > 0.5 ? gridSun.x : gridSun.y) * sign(across);
            roofColor *= 1.0 + 0.42 * towardSun * resolved;
            roofColor *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.5 + aa, abs(across))) * resolved;
            // Drive from the house to the edge of its plot.
            garden = mix(garden, vec3(0.17, 0.165, 0.155), band(fromCentre.x, -6.4, -5.0, aa) * step(0.15, r) * resolved * 0.8);
          } else {
            shade = body;
          }
        }
        garden *= 1.0 - 0.5 * shade * (1.0 - house) * resolved * uShadowParams.x;
        blockColor = mix(pavement, mix(garden, roofColor, house), inLot);
      } else if (core > 0.12) {
        // Business district: stone-paved plazas with planters.
        vec2 slab = abs(fract(lot / 3.6) - 0.5) * 3.6;
        vec3 plaza = vec3(0.24, 0.235, 0.225) * (0.9 + 0.2 * tNoise(g / 5.0));
        plaza *= 1.0 - 0.16 * (1.0 - smoothstep(0.05, 0.05 + aa, min(slab.x, slab.y))) * (1.0 - smoothstep(0.3, 1.2, aa));
        vec2 lean;
        float crown = canopy(g + 11.0, 11.0, lean) * step(0.6, tNoise(g / 19.0 + 3.0));
        plaza = mix(plaza, vec3(0.03, 0.058, 0.024) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * resolved);
        blockColor = mix(pavement, plaza, inLot);
      } else {
        float type = tCityBlockType(ic);
        vec3 inside = pavement * 0.92;
        vec2 lean;
        if (type < 0.5) {
          // Separate buildings: service yards, a few planted corners.
          float yard = step(0.55, tNoise(lot / 26.0 + seed * 9.0));
          inside = mix(inside, lawn, yard * 0.85);
          float crown = canopy(g + 5.0, 9.0, lean) * yard;
          inside = mix(inside, vec3(0.03, 0.058, 0.024) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * resolved);
        } else if (type < 1.5) {
          // Courtyard inside a perimeter block: lawn, crossing paths, trees.
          float court = band(lot.x, -lotSize.x * 0.5 + 17.0, lotSize.x * 0.5 - 17.0, aa)
            * band(lot.y, -lotSize.y * 0.5 + 17.0, lotSize.y * 0.5 - 17.0, aa);
          vec3 green = lawn;
          float path = max(1.0 - smoothstep(1.1, 1.1 + aa, abs(lot.x + lot.y * (seed - 0.5))),
            1.0 - smoothstep(1.1, 1.1 + aa, abs(lot.y - lot.x * (seed - 0.5))));
          green = mix(green, vec3(0.33, 0.3, 0.25), path * resolved);
          float crown = canopy(g + 7.0, 7.5, lean) * step(0.45, tNoise(g / 13.0 + seed * 30.0));
          green = mix(green, vec3(0.03, 0.058, 0.024) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * resolved);
          inside = mix(inside, green, court);
        } else if (type < 2.5) {
          // Slabs in open ground: lawns, paths between entrances, car parking.
          vec3 green = lawn * (0.94 + 0.12 * tNoise(g / 9.0));
          float path = 1.0 - smoothstep(1.0, 1.0 + aa, abs(fract((lot.x - lot.y) / 44.0) - 0.5) * 44.0);
          green = mix(green, vec3(0.3, 0.28, 0.24), path * resolved);
          float crown = canopy(g + 9.0, 9.5, lean) * step(0.5, tNoise(g / 21.0 + seed * 11.0));
          green = mix(green, vec3(0.03, 0.058, 0.024) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * resolved);
          float parking = band(lot.x, -lotSize.x * 0.5 + 2.0, lotSize.x * 0.5 - 2.0, aa)
            * band(lot.y, lotSize.y * 0.5 - 17.5, lotSize.y * 0.5 - 1.0, aa) * step(0.5, seed);
          inside = green;
          if (parking > 0.0) inside = mix(inside, carPark(lot + lotSize * 0.5 - vec2(2.0, lotSize.y - 17.5), aa, fine, seed), parking);
        } else {
          // Retail: the car park in front of the store.
          float parking = band(lot.x, -lotSize.x * 0.5 + 3.0, lotSize.x * 0.5 - 3.0, aa)
            * band(lot.y, 4.0, lotSize.y * 0.5 - 2.0, aa);
          inside = asphalt * 1.3;
          if (parking > 0.0) inside = mix(inside, carPark(lot - vec2(-lotSize.x * 0.5 + 3.0, 4.0), aa, fine, seed), parking);
        }
        blockColor = mix(pavement, inside, inLot);
      }

      // Street trees in the footway, clear of the junctions.
      {
        vec2 lean;
        float clearX = band(local.y, streetY + 9.0, B - 4.0, aa);
        float clearY = band(local.x, streetX + 9.0, B - 4.0, aa);
        float treeX = (rowTree(vec2(local.x - streetX - 1.6, g.y), 12.0, aa, lean)
          + rowTree(vec2(local.x - B + 1.6, g.y + 5.0), 12.0, aa, lean)) * clearX;
        float treeY = (rowTree(vec2(local.y - streetY - 1.6, g.x + 3.0), 12.0, aa, lean)
          + rowTree(vec2(local.y - B + 1.6, g.x + 8.0), 12.0, aa, lean)) * clearY;
        float tree = clamp(treeX + treeY, 0.0, 1.0) * (suburb ? 0.0 : 1.0);
        blockColor = mix(blockColor, vec3(0.032, 0.062, 0.026), tree * resolved);
      }

      // Carriageways: one street along each low edge of the block cell.
      float kerbX = streetX > 30.0 ? 4.0 : 3.0;
      float kerbY = streetY > 30.0 ? 4.0 : 3.0;
      vec4 alongY = cityStreet(local.x - streetX * 0.5, g.y, local.y, streetX * 0.5 - kerbX, streetY, aa, fine);
      vec4 alongX = cityStreet(local.y - streetY * 0.5, g.x, local.x, streetY * 0.5 - kerbY, streetX, aa, fine);
      vec3 cityColor = blockColor;
      // Kerb stones.
      float kerb = max(band(abs(local.x - streetX * 0.5), streetX * 0.5 - kerbX, streetX * 0.5 - kerbX + 0.3, aa),
        band(abs(local.y - streetY * 0.5), streetY * 0.5 - kerbY, streetY * 0.5 - kerbY + 0.3, aa));
      cityColor = mix(cityColor, vec3(0.3, 0.3, 0.29), kerb * (1.0 - smoothstep(0.3, 1.2, aa)));
      cityColor = mix(cityColor, alongY.rgb, alongY.a);
      cityColor = mix(cityColor, alongX.rgb, alongX.a);
      // The junction itself is plain asphalt.
      cityColor = mix(cityColor, asphalt, alongY.a * alongX.a);
      albedo = mix(albedo, cityColor, urban);
      forest *= 1.0 - urban;
    }

    albedo = mix(albedo, road.rgb, road.a);

    // ---- Water ---------------------------------------------------------------
    // Distance from each watercourse's centreline, less its half-width:
    // negative on the water, positive up the bank.
    float bank = 1e5;
    float quay = 0.0;
    float water = sea;
    if (w[1] > 0.001) {
      float r = abs(lateral - tValleyRiver(d)) - ${n(C.water.valleyRiver)};
      water = max(water, w[1] * (1.0 - smoothstep(-aa, aa, r)));
      bank = min(bank, r + (1.0 - w[1]) * 1e4);
    }
    if (w[2] > 0.001) {
      float r = abs(lateral - tCanalLine(d)) - ${n(C.water.canal)};
      water = max(water, w[2] * (1.0 - smoothstep(-aa, aa, r)));
      // The canal is walled, with a towpath.
      float wall = band(r, 0.0, 1.6, aa);
      float towpath = band(r, 4.0, 7.5, aa);
      albedo = mix(albedo, vec3(0.3, 0.295, 0.28) * (0.9 + 0.2 * fine), wall * w[2]);
      albedo = mix(albedo, vec3(0.26, 0.23, 0.18) * (0.9 + 0.2 * fine), towpath * w[2] * (1.0 - smoothstep(1.5, 5.0, aa)));
      quay = max(quay, w[2]);
    }
    if (w[3] > 0.001) {
      float field = tUplandRiverField(p);
      float fw = max(fwidth(field), 1e-7);
      water = max(water, w[3] * (1.0 - smoothstep(${n(C.water.uplandRiver)} - fw, ${n(C.water.uplandRiver)} + fw,
        abs(field - 0.5))));
      float r = abs(lateral - tUplandRiver(d)) - ${n(C.water.uplandMain)};
      water = max(water, w[3] * (1.0 - smoothstep(-aa, aa, r)));
      bank = min(bank, min(r, (abs(field - 0.5) - ${n(C.water.uplandRiver)}) / fw * aa) + (1.0 - w[3]) * 1e4);
    }
    if (w[4] > 0.001) {
      float r = abs(lateral - tCityRiver(d)) - ${n(C.water.cityRiver)};
      water = max(water, w[4] * (1.0 - smoothstep(-aa, aa, r)));
      // Stone embankments, a riverside walk under trees, then the city.
      float wall = band(r, 0.0, 2.6, aa);
      float walk = band(r, 2.6, 16.0, aa);
      vec3 promenade = vec3(0.27, 0.26, 0.24) * (0.9 + 0.2 * fine);
      vec2 lean;
      float crown = rowTree(vec2(r - 9.5, d), 11.0, aa, lean);
      promenade = mix(promenade, vec3(0.032, 0.062, 0.026) * (1.0 + 0.6 * dot(lean, sunAcross)), crown * (1.0 - smoothstep(1.5, 5.0, aa)));
      float cityShare = w[4] * (1.0 - smoothstep(3800.0, 6200.0, abs(lateral - ${n(CITY_AXIS)})));
      albedo = mix(albedo, promenade, walk * cityShare);
      albedo = mix(albedo, vec3(0.36, 0.35, 0.33) * (0.9 + 0.2 * fine), wall * cityShare);
      quay = max(quay, cityShare);
      bank = min(bank, r + cityShare * 1e4 + (1.0 - w[4]) * 1e4);
    }
    // Natural banks: shingle bars at the water's edge, then reeds and trees.
    if (bank < 60.0) {
      float ragged = bank + 9.0 * (mid - 0.5) + 5.0 * (tNoise(p / 16.0) - 0.5);
      float shingle = band(ragged, -3.0, 5.0, aa + 1.0);
      albedo = mix(albedo, vec3(0.3, 0.28, 0.24) * (0.85 + 0.3 * fine), shingle * 0.85);
      float riparian = band(ragged, 6.0, 26.0, aa + 3.0) * smoothstep(0.3, 0.6, tNoise(p / 45.0 + 9.0));
      vec2 lean;
      float crown = canopy(p + 2.0, 8.0, lean);
      albedo = mix(albedo, forestColor * mix(0.6, 1.15, crown), riparian * 0.9);
      shadingNormal = normalize(shadingNormal + vec3(lean.x, 0.0, lean.y) * (0.7 * riparian * (1.0 - smoothstep(2.0, 6.0, aa))));
    }
    // Sea that only the geometry knows about (where regions overlap).
    water = max(water, smoothstep(0.6, 0.95, vWater) * (1.0 - step(0.05, h)));
    water = clamp(water, 0.0, 1.0);

    float lit = sunShadow(vWorld, N);
    vec3 color = surfaceLightShadowed(albedo, shadingNormal, lit);

    if (water > 0.001) {
      // Rivers run with the route; the sea drifts onshore.
      vec2 flow = sea > 0.5 ? vec2(uTime * 0.05, uTime * 0.02) : vec2(0.0, uTime * 0.11);
      vec3 wn = waterNormal(p, viewDistance, flow);
      // Turquoise shallows along the tropical shore, darker open sea and rivers.
      float shallows = w[0] * (1.0 - smoothstep(-320.0, -20.0, -abs(min(inland, 0.0))));
      vec3 deep = mix(vec3(0.016, 0.04, 0.042), vec3(0.006, 0.03, 0.05), w[0]);
      deep = mix(deep, vec3(0.02, 0.09, 0.09), shallows * 0.8);
      // Rivers shoal toward their banks: silt shows green-brown through the water.
      float margin = sea > 0.5 ? 0.0 : 1.0 - smoothstep(0.0, 14.0, -bank);
      deep = mix(deep, vec3(0.06, 0.075, 0.045), margin * 0.7 * (1.0 - quay));
      // Current lines: smooth tongues of faster water down the channel.
      float current = tNoise(vec2(lateral * 0.12, d * 0.012 - uTime * 0.05));
      deep *= 0.82 + 0.36 * current * (1.0 - step(0.5, sea));
      vec3 body = surfaceLightShadowed(deep, vec3(0.0, 1.0, 0.0), lit);
      vec3 R = reflect(-V, wn);
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
      vec2 bearing = normalize(R.xz + vec2(1e-5));
      vec3 skyColor = mix(uFogColor, uAmbientSky * (0.42 * uAmbientIntensity), clamp(R.y * 1.6, 0.0, 1.0))
        + uGlow * (uGlowStrength * 0.5 * pow(max(dot(bearing, sunAcross), 0.0), 6.0) * (1.0 - clamp(R.y * 3.0, 0.0, 1.0)));
      // A broad sheen and a tight glitter path toward the sun.
      float glint = (pow(max(dot(R, uSunDirection), 0.0), 600.0) * 0.6 + pow(max(dot(R, uSunDirection), 0.0), 60.0) * 0.035)
        * uSunIntensity * lit;
      vec3 waterColor = mix(body, skyColor, fresnel) + uSunColor * glint * 1.6;
      // Surf along the beach, in sets that roll in and fade.
      float set = fract(inland / 46.0 + uTime * 0.07 + 0.35 * tNoise(vec2(p.y / 90.0, 2.0)));
      float breaker = (1.0 - smoothstep(0.0, 0.16, abs(set - 0.5))) * (1.0 - smoothstep(20.0, 120.0, -inland)) * step(inland, 0.0);
      float foam = w[0] * max((1.0 - smoothstep(0.0, 18.0, abs(inland + 14.0)))
        * smoothstep(0.45, 0.75, tNoise(vec2(inland * 0.15, p.y * 0.02) + tNoise(p / 30.0))),
        breaker * smoothstep(0.35, 0.7, tNoise(p / 9.0 + 3.0)) * 0.8);
      waterColor = mix(waterColor, surfaceLightShadowed(vec3(0.55), vec3(0.0, 1.0, 0.0), lit), foam * 0.6);
      color = mix(color, waterColor, water);
    }

    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

// ---------------------------------------------------------------------------
// Quadtree of tiles
// ---------------------------------------------------------------------------

/** The square the quadtree covers, centred on the route. */
const ROOT = { x: 0, z: -24_000, size: 131_072 } as const;
/** Smallest tile, in metres. */
const MIN_TILE = 256;
const MAX_LEVEL = Math.round(Math.log2(ROOT.size / MIN_TILE));
/** A tile splits when the camera is closer than this many tile widths. */
const LOD_FACTOR = 2.1;
/** Levels built up front, so a coarse surface is always available. */
const BASE_LEVEL = 3;
/** Milliseconds per frame spent building tiles. */
const BUILD_BUDGET_MS = 4;
/** Tiles kept in memory before the least recently used are released. */
const CACHE_LIMIT = 520;

type TerrainUniforms = LightingUniforms & { uTime: THREE.IUniform<number> };

interface Tile {
  key: number;
  level: number;
  mesh: THREE.Mesh;
  maxHeight: number;
  lastUsed: number;
}

interface TerrainState {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  uniforms: TerrainUniforms;
  index: THREE.BufferAttribute;
  tiles: Map<number, Tile>;
  wanted: Map<number, number>;
  visible: Set<Tile>;
  spare: Set<Tile>;
  frame: number;
}

// Keys pack level and integer tile coordinates into one number.
const keyOf = (level: number, i: number, j: number) => (level * 1024 + i) * 1024 + j;

function tileSize(level: number): number {
  return ROOT.size / 2 ** level;
}

function tileCentre(level: number, i: number, j: number): [number, number] {
  const size = tileSize(level);
  return [ROOT.x - ROOT.size / 2 + (i + 0.5) * size, ROOT.z - ROOT.size / 2 + (j + 0.5) * size];
}

function createTile(state: TerrainState, level: number, i: number, j: number): Tile {
  const size = tileSize(level);
  const [cx, cz] = tileCentre(level, i, j);
  const data = buildTile(cx, cz, size);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute("aWater", new THREE.BufferAttribute(data.water, 1));
  geometry.setIndex(state.index);
  const halfHeight = (data.maxHeight - data.minHeight) / 2 + size * 0.06 + 4;
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, (data.maxHeight + data.minHeight) / 2, 0),
    Math.hypot(size / Math.SQRT2, halfHeight),
  );
  geometry.boundingBox = new THREE.Box3(
    new THREE.Vector3(-size / 2, data.minHeight - size * 0.06 - 4, -size / 2),
    new THREE.Vector3(size / 2, data.maxHeight, size / 2),
  );

  const mesh = new THREE.Mesh(geometry, state.material);
  mesh.position.set(cx, 0, cz);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.renderOrder = -10;
  mesh.visible = false;
  mesh.layers.enable(SHADOW_LAYER);
  mesh.layers.enable(SHADOW_FAR_LAYER);
  state.group.add(mesh);

  const tile: Tile = {
    key: keyOf(level, i, j),
    level,
    mesh,
    maxHeight: data.maxHeight,
    lastUsed: state.frame,
  };
  state.tiles.set(tile.key, tile);
  return tile;
}

function releaseTile(state: TerrainState, tile: Tile): void {
  state.group.remove(tile.mesh);
  tile.mesh.geometry.dispose();
  state.tiles.delete(tile.key);
  state.visible.delete(tile);
}

function show(state: TerrainState, tile: Tile, selected: Set<Tile>): void {
  tile.lastUsed = state.frame;
  selected.add(tile);
}

/** Picks the tiles to draw for this camera position and queues missing detail. */
function selectTiles(
  state: TerrainState,
  level: number,
  i: number,
  j: number,
  camera: THREE.Vector3,
  parentTop: number,
  selected: Set<Tile>,
): void {
  const tile = state.tiles.get(keyOf(level, i, j));
  if (!tile) return;
  tile.lastUsed = state.frame;
  const size = tileSize(level);
  const [cx, cz] = tileCentre(level, i, j);
  const dx = Math.max(Math.abs(camera.x - cx) - size / 2, 0);
  const dz = Math.max(Math.abs(camera.z - cz) - size / 2, 0);
  const top = Math.max(tile.maxHeight, parentTop * 0.5);
  const dy = Math.max(camera.y - top, 0);
  const distance = Math.hypot(dx, dy, dz);

  if (level >= MAX_LEVEL || distance > size * LOD_FACTOR) {
    show(state, tile, selected);
    return;
  }

  const childLevel = level + 1;
  let ready = true;
  for (let c = 0; c < 4; c++) {
    const ci = i * 2 + (c & 1);
    const cj = j * 2 + (c >> 1);
    const key = keyOf(childLevel, ci, cj);
    if (!state.tiles.has(key)) {
      ready = false;
      const priority = distance / size;
      const queued = state.wanted.get(key);
      if (queued === undefined || priority < queued) state.wanted.set(key, priority);
    }
  }
  if (!ready) {
    show(state, tile, selected);
    return;
  }
  for (let c = 0; c < 4; c++) {
    selectTiles(state, childLevel, i * 2 + (c & 1), j * 2 + (c >> 1), camera, tile.maxHeight, selected);
  }
}

function buildWanted(state: TerrainState, budgetMs: number): void {
  if (state.wanted.size === 0) return;
  const queue = Array.from(state.wanted.entries()).sort((a, b) => a[1] - b[1]);
  state.wanted.clear();
  const start = performance.now();
  for (const [key] of queue) {
    if (state.tiles.has(key)) continue;
    const level = Math.floor(key / (1024 * 1024));
    const rest = key - level * 1024 * 1024;
    createTile(state, level, Math.floor(rest / 1024), rest % 1024);
    if (performance.now() - start > budgetMs) break;
  }
}

function evict(state: TerrainState): void {
  if (state.tiles.size <= CACHE_LIMIT) return;
  const candidates = Array.from(state.tiles.values())
    .filter((tile) => tile.level > BASE_LEVEL && state.frame - tile.lastUsed > 90)
    .sort((a, b) => a.lastUsed - b.lastUsed);
  for (const tile of candidates) {
    if (state.tiles.size <= CACHE_LIMIT * 0.85) break;
    releaseTile(state, tile);
  }
}

const cameraPosition = new THREE.Vector3();

function updateTerrain(state: TerrainState, camera: THREE.Camera): void {
  state.frame++;
  updateLightingUniforms(state.uniforms, flightFrame.atmosphere);
  state.uniforms.uTime.value = flightFrame.time;
  camera.getWorldPosition(cameraPosition);

  // Two sets are swapped each frame instead of allocating a new one.
  const selected = state.spare;
  selected.clear();
  selectTiles(state, 0, 0, 0, cameraPosition, 0, selected);
  let changed = false;
  for (const tile of state.visible) {
    if (!selected.has(tile)) {
      tile.mesh.visible = false;
      changed = true;
    }
  }
  for (const tile of selected) {
    if (!tile.mesh.visible) {
      tile.mesh.visible = true;
      changed = true;
    }
  }
  // The terrain casts shadows, so a change of detail means redrawing them.
  if (changed) invalidateSunShadows(false);
  state.spare = state.visible;
  state.visible = selected;

  buildWanted(state, BUILD_BUDGET_MS);
  evict(state);
}

interface TerrainResources {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  uniforms: TerrainUniforms;
  index: THREE.BufferAttribute;
}

function createTerrainResources(): TerrainResources {
  const uniforms: TerrainUniforms = { ...createLightingUniforms(), uTime: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms: { ...(uniforms as unknown as Record<string, THREE.IUniform>), ...shadowUniforms },
    vertexShader,
    fragmentShader,
  });
  return {
    group: new THREE.Group(),
    material,
    uniforms,
    index: new THREE.BufferAttribute(tileIndices(), 1),
  };
}

function createTerrainState(resources: TerrainResources): TerrainState {
  const state: TerrainState = {
    ...resources,
    tiles: new Map(),
    wanted: new Map(),
    visible: new Set(),
    spare: new Set(),
    frame: 0,
  };
  // The coarse levels are built immediately so there is always a surface.
  for (let level = 0; level <= BASE_LEVEL; level++) {
    const count = 2 ** level;
    for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) createTile(state, level, i, j);
  }
  return state;
}

function disposeTerrain(state: TerrainState): void {
  for (const tile of Array.from(state.tiles.values())) releaseTile(state, tile);
  state.material.dispose();
}

/** Vertices per tile, for documentation and the performance budget. */
export const TERRAIN_TILE_VERTICES = TILE_VERTICES;

/**
 * The ground for the whole flight: world-fixed tiles chosen by distance from
 * the camera, built on demand within a small per-frame budget, and released
 * when they have not been needed for a while.
 */
export function Terrain() {
  const resources = useMemo(() => createTerrainResources(), []);
  const stateRef = useRef<TerrainState | null>(null);

  useEffect(() => {
    const state = createTerrainState(resources);
    stateRef.current = state;
    return () => {
      stateRef.current = null;
      disposeTerrain(state);
    };
  }, [resources]);

  useFrame(({ camera }) => {
    if (stateRef.current) updateTerrain(stateRef.current, camera);
  });

  return <primitive object={resources.group} />;
}
