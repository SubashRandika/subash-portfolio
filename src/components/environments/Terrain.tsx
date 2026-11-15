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
import { flightFrame } from "@/flight/frame";
import { CITY_AXIS, TERRAIN_CONSTANTS, TERRAIN_GLSL } from "@/flight/terrain";
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

const fragmentShader = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWater;
  ${TERRAIN_GLSL}
  ${LIGHTING_FUNCTIONS}

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
    float rows = 0.5 + 0.5 * sin(local.x * (r > 0.66 ? 1.7 : 0.9));
    crop *= 0.93 + 0.1 * mix(rows, 0.5, smoothstep(0.4, 1.6, aa));
    crop *= 0.88 + 0.24 * fine;
    // Hedgerows and tracks: thin, so they fade out once narrower than a pixel.
    float edge = min(min(local.x, size.x - local.x), min(local.y, size.y - local.y));
    float hedge = (1.0 - smoothstep(2.0, 2.0 + aa, edge)) * (1.0 - smoothstep(1.5, 5.0, aa));
    return mix(crop, vec3(0.03, 0.05, 0.02), hedge * 0.75);
  }

  // Tree crowns on a jittered grid. Returns coverage; writes the crown's
  // dome normal so each tree is lit on its sunny side.
  float canopy(vec2 p, float spacing, out vec2 lean) {
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

  // Small wind-driven ripples, calmer with distance.
  vec3 waterNormal(vec2 p, float viewDistance) {
    vec2 q = p / 7.0;
    float e = 0.2;
    float h0 = tNoise(q) + 0.5 * tNoise(q * 2.7 + 3.1);
    float hx = tNoise(q + vec2(e, 0.0)) + 0.5 * tNoise((q + vec2(e, 0.0)) * 2.7 + 3.1);
    float hz = tNoise(q + vec2(0.0, e)) + 0.5 * tNoise((q + vec2(0.0, e)) * 2.7 + 3.1);
    float amplitude = 0.02 + 0.2 * (1.0 - smoothstep(200.0, 2000.0, viewDistance));
    return normalize(vec3((h0 - hx) * amplitude * 2.5, 1.0, (h0 - hz) * amplitude * 2.5));
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
          vec2 lot = floor(p / 18.0);
          vec2 inLot = p - lot * 18.0;
          float r = tHash(ivec2(lot) + ic * 7);
          vec3 roof = r < 0.5 ? vec3(0.25, 0.11, 0.07) : r < 0.8 ? vec3(0.2, 0.19, 0.18) : vec3(0.34, 0.33, 0.31);
          float house = band(inLot.x, 4.0, 14.0, aa) * band(inLot.y, 4.0, 13.0, aa) * step(0.35, r);
          vec3 village = mix(grass * 1.05, roof, house * (1.0 - smoothstep(2.0, 6.0, aa)) + 0.25 * smoothstep(2.0, 6.0, aa));
          albedo = mix(albedo, village, inVillage * rural);
        }
      }
    }
    albedo = mix(albedo, forestColor, forest);

    // Rock on steep or high ground, snow on the highest peaks.
    float rocky = clamp(
      smoothstep(0.38, 0.55, slope + 0.06 * (mid - 0.5)) + smoothstep(1350.0, 1750.0, h + 150.0 * mid),
      0.0, 1.0);
    albedo = mix(albedo, rock * 0.8, rocky);
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
      albedo *= mix(1.0, mix(0.6, 1.08, crown), visible);
      shadingNormal = normalize(N + vec3(lean.x, 0.0, lean.y) * (0.9 * visible));
    }

    // ---- Roads -------------------------------------------------------------
    vec3 asphalt = vec3(0.05, 0.052, 0.056) * (0.9 + 0.2 * fine);
    float road = 0.0;
    road += w[1] * band(abs(lateral - tValleyRiver(d) - 120.0), 0.0, 4.0, aa);
    road += w[2] * band(abs(lateral - 300.0), 0.0, 11.0, aa);
    if (w[3] > 0.001) {
      float field = tFbm(p / 5000.0 + 70.0, 3);
      float gradient = max(fwidth(field) / aa, 1e-7);
      road += w[3] * band(abs(field - 0.5) / gradient, 0.0, 4.0, aa) * (1.0 - smoothstep(0.2, 0.3, slope));
    }

    // ---- Coast: beach, airfield -------------------------------------------
    float sea = 0.0;
    float inland = 1e5;
    if (w[0] > 0.001) {
      inland = p.x - tCoastline(d);
      float airfield = tAirfield(p);
      float beach = smoothstep(-8.0, 0.0, inland) * (1.0 - smoothstep(40.0, 140.0 + 60.0 * mid, inland))
        * (1.0 - smoothstep(2.0, 5.0, h));
      albedo = mix(albedo, vec3(0.46, 0.41, 0.31) * (0.9 + 0.2 * fine), beach * w[0] * (1.0 - airfield));
      sea = w[0] * (1.0 - smoothstep(-6.0, 6.0, inland)) * (1.0 - airfield);
      road += w[0] * band(abs(inland - 380.0), 0.0, 4.5, aa) * (1.0 - airfield);

      if (airfield > 0.001) {
        // Mown grass along the runway strip.
        float strip = (1.0 - smoothstep(40.0, 260.0, abs(p.x))) * band(p.y, -3000.0, 300.0, 40.0);
        albedo = mix(albedo, vec3(0.07, 0.098, 0.036) * (0.9 + 0.2 * fine), strip * 0.4 * airfield);
        // Parallel taxiway, its links to the runway, and the apron.
        float taxiway = band(p.x, 168.5, 191.5, aa) * band(p.y, -2962.0, 72.0, aa);
        float links = (band(p.y, 48.5, 71.5, aa) + band(p.y, -1461.5, -1438.5, aa) + band(p.y, -2961.5, -2938.5, aa))
          * band(p.x, 22.0, 185.0, aa);
        float apron = band(p.x, 191.0, 560.0, aa) * band(p.y, -1700.0, -1150.0, aa);
        float paved = clamp(taxiway + links + apron, 0.0, 1.0);
        vec3 concrete = vec3(0.13, 0.13, 0.128) * (0.85 + 0.3 * tNoise(p / 3.0));
        vec3 pavement = mix(asphalt, concrete, apron);
        float centreline = band(abs(p.x - 180.0), 0.0, 0.25, aa * 0.5) * band(p.y, -2950.0, 60.0, aa)
          * (1.0 - smoothstep(1.0, 3.0, aa));
        pavement = mix(pavement, vec3(0.42, 0.32, 0.06), centreline);
        albedo = mix(albedo, pavement, paved * airfield);
      }
    }

    // ---- Industrial plain ---------------------------------------------------
    if (w[2] > 0.001) {
      if (industrialKind > 0.5) {
        vec3 ground = industrialKind < 1.5 ? vec3(0.16, 0.155, 0.145)
          : industrialKind < 2.5 ? vec3(0.07, 0.072, 0.075)
          : vec3(0.18, 0.175, 0.165);
        ground *= 0.82 + 0.3 * tNoise(p / 23.0) + 0.08 * fine;
        float edge = min(min(plotLocal.x, ${n(C.industrialPlot)} - plotLocal.x),
          min(plotLocal.y, ${n(C.industrialPlot)} - plotLocal.y));
        vec3 plotColor = mix(grass * 0.9, ground, smoothstep(13.0, 15.0, edge));
        plotColor = mix(plotColor, asphalt, band(edge, 2.0, 11.0, aa));
        albedo = mix(albedo, plotColor, w[2]);
        forest = 0.0;
      }
      float rail = band(abs(lateral + 650.0), 0.0, 6.0, aa);
      albedo = mix(albedo, vec3(0.11, 0.095, 0.08) * (0.8 + 0.4 * fine), rail * w[2]);
    }

    // ---- City ---------------------------------------------------------------
    float urban = w[4] * (1.0 - smoothstep(3800.0, 6200.0, abs(lateral - ${n(CITY_AXIS)})));
    if (urban > 0.001) {
      vec2 g = tToCityGrid(p);
      vec2 cell = floor(g / ${n(C.cityBlock)});
      vec2 local = g - cell * ${n(C.cityBlock)};
      ivec2 ic = ivec2(cell);
      float streetX = mod(cell.x, ${n(C.cityAvenueEvery)}) < 0.5 ? ${n(C.cityAvenue)} : ${n(C.cityStreet)};
      float streetY = mod(cell.y, ${n(C.cityAvenueEvery)}) < 0.5 ? ${n(C.cityAvenue)} : ${n(C.cityStreet)};
      float street = max(1.0 - smoothstep(streetX - aa, streetX + aa, local.x),
        1.0 - smoothstep(streetY - aa, streetY + aa, local.y));
      bool park = tHash(ic + ivec2(55, 0)) < ${n(C.parkShare)};

      // Is this block built up with geometry, or suburbs drawn as roofs?
      vec2 centreGrid = (cell + 0.5) * ${n(C.cityBlock)};
      float cc = ${n(Math.cos(0.21))};
      float ss = ${n(Math.sin(0.21))};
      vec2 centre = vec2(cc * centreGrid.x + ss * centreGrid.y, -ss * centreGrid.x + cc * centreGrid.y);
      float centreLateral = centre.x - tRouteLateral(max(-centre.y, 0.0));
      float core = tDowntown(centre, centreLateral);

      vec3 pavement = vec3(0.15, 0.148, 0.142) * (0.85 + 0.3 * tNoise(g / 7.0));
      vec3 blockColor = pavement;
      if (park) {
        blockColor = grass * 1.05;
      } else if (core < 0.03 && abs(centreLateral - 300.0) > 2200.0) {
        // Suburbs: houses on small lots with gardens.
        vec2 lot = floor(local / 16.0);
        vec2 inLot = local - lot * 16.0;
        float r = tHash(ivec2(lot) + ic * 13);
        vec3 roof = r < 0.45 ? vec3(0.23, 0.1, 0.07) : r < 0.8 ? vec3(0.16, 0.16, 0.165) : vec3(0.08, 0.08, 0.085);
        float house = band(inLot.x, 3.0, 13.0, aa) * band(inLot.y, 3.0, 12.0, aa) * step(0.15, r);
        blockColor = mix(grass * 0.95, roof, house);
      }
      vec3 cityColor = mix(blockColor, asphalt, street);
      albedo = mix(albedo, cityColor, urban);
      forest *= 1.0 - urban;
    }

    albedo = mix(albedo, asphalt, clamp(road, 0.0, 1.0));

    // ---- Water ---------------------------------------------------------------
    float water = sea;
    water = max(water, w[1] * (1.0 - smoothstep(${n(C.water.valleyRiver)} - aa, ${n(C.water.valleyRiver)} + aa,
      abs(lateral - tValleyRiver(d)))));
    water = max(water, w[2] * (1.0 - smoothstep(${n(C.water.canal)} - aa, ${n(C.water.canal)} + aa,
      abs(lateral - tCanalLine(d)))));
    if (w[3] > 0.001) {
      float field = tUplandRiverField(p);
      float fw = max(fwidth(field), 1e-7);
      water = max(water, w[3] * (1.0 - smoothstep(${n(C.water.uplandRiver)} - fw, ${n(C.water.uplandRiver)} + fw,
        abs(field - 0.5))));
      water = max(water, w[3] * (1.0 - smoothstep(${n(C.water.uplandMain)} - aa, ${n(C.water.uplandMain)} + aa,
        abs(lateral - tUplandRiver(d)))));
    }
    water = max(water, w[4] * (1.0 - smoothstep(${n(C.water.cityRiver)} - aa, ${n(C.water.cityRiver)} + aa,
      abs(lateral - tCityRiver(d)))));
    // Sea that only the geometry knows about (where regions overlap).
    water = max(water, smoothstep(0.6, 0.95, vWater) * (1.0 - step(0.05, h)));
    water = clamp(water, 0.0, 1.0);

    vec3 color = surfaceLight(albedo, shadingNormal);

    if (water > 0.001) {
      vec3 wn = waterNormal(p, viewDistance);
      // Turquoise shallows along the tropical shore, darker open sea and rivers.
      float shallows = w[0] * (1.0 - smoothstep(-320.0, -20.0, -abs(min(inland, 0.0))));
      vec3 deep = mix(vec3(0.016, 0.04, 0.042), vec3(0.006, 0.03, 0.05), w[0]);
      deep = mix(deep, vec3(0.02, 0.09, 0.09), shallows * 0.8);
      vec3 body = surfaceLight(deep, vec3(0.0, 1.0, 0.0));
      vec3 R = reflect(-V, wn);
      float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
      vec2 bearing = normalize(R.xz + vec2(1e-5));
      vec2 sunBearing = normalize(uSunDirection.xz + vec2(1e-5));
      vec3 skyColor = mix(uFogColor, uAmbientSky * (0.42 * uAmbientIntensity), clamp(R.y * 1.6, 0.0, 1.0))
        + uGlow * (uGlowStrength * 0.5 * pow(max(dot(bearing, sunBearing), 0.0), 6.0) * (1.0 - clamp(R.y * 3.0, 0.0, 1.0)));
      float glint = pow(max(dot(R, uSunDirection), 0.0), 600.0) * uSunIntensity * 0.6;
      vec3 waterColor = mix(body, skyColor, fresnel) + uSunColor * glint * 1.6;
      // Surf along the beach.
      float foam = w[0] * (1.0 - smoothstep(0.0, 18.0, abs(inland + 14.0)))
        * smoothstep(0.45, 0.75, tNoise(vec2(inland * 0.15, p.y * 0.02) + tNoise(p / 30.0)));
      waterColor = mix(waterColor, surfaceLight(vec3(0.55), vec3(0.0, 1.0, 0.0)), foam * 0.6);
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
  uniforms: LightingUniforms;
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
  camera.getWorldPosition(cameraPosition);

  // Two sets are swapped each frame instead of allocating a new one.
  const selected = state.spare;
  selected.clear();
  selectTiles(state, 0, 0, 0, cameraPosition, 0, selected);
  for (const tile of state.visible) if (!selected.has(tile)) tile.mesh.visible = false;
  for (const tile of selected) tile.mesh.visible = true;
  state.spare = state.visible;
  state.visible = selected;

  buildWanted(state, BUILD_BUDGET_MS);
  evict(state);
}

interface TerrainResources {
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  uniforms: LightingUniforms;
  index: THREE.BufferAttribute;
}

function createTerrainResources(): TerrainResources {
  const uniforms = createLightingUniforms();
  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
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
