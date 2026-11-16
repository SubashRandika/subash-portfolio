"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  type LightingUniforms,
  createLightingUniforms,
  updateLightingUniforms,
} from "@/components/flight/lightingUniforms";
import {
  LIGHTING_FUNCTIONS,
  LIGHTING_UNIFORMS,
  NOISE_FUNCTIONS,
  OUTPUT_CHUNKS,
} from "@/components/flight/shaders/lighting.glsl";
import {
  SHADOW_GLSL,
  SHADOW_LAYER,
  invalidateSunShadows,
  shadowUniforms,
} from "@/components/flight/sunShadow";
import { flightFrame } from "@/flight/frame";
import {
  STRUCTURE_KINDS,
  STRUCTURE_SHAPES,
  type Structure,
  type StructureShape,
} from "@/flight/structures";

const K = STRUCTURE_KINDS;
const S = STRUCTURE_SHAPES;

const vertexShader = /* glsl */ `
  attribute vec3 aStyle;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObjectNormal;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vStyle;

  void main() {
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    // Instances are stretched along their own axes. A normal must be divided
    // by the stretch, not multiplied, to stay square to a sloping face:
    // (rotation * scale) * (n / scale^2) = rotation * (n / scale).
    vNormal = normalize(mat3(model) * (normal / (vSize * vSize)));
    vObjectNormal = normal;
    // Metres within the structure, from the centre of its base.
    vLocal = position * vSize;
    vStyle = aStyle;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  ${SHADOW_GLSL}
  uniform float uLamps;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObjectNormal;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec3 vStyle;
  ${NOISE_FUNCTIONS}
  ${LIGHTING_FUNCTIONS}

  float band(float x, float lo, float hi, float aa) {
    return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
  }

  // 0 while a repeating detail of the given size is resolved, 1 once it is
  // smaller than a pixel or two and must be replaced by its average.
  float blur(float aa, float size) {
    return smoothstep(0.22, 0.8, aa / size);
  }

  // Sky seen in a reflective surface.
  vec3 skyReflection(vec3 R) {
    vec2 bearing = normalize(R.xz + vec2(1e-5));
    vec2 sunBearing = normalize(uSunDirection.xz + vec2(1e-5));
    vec3 sky = mix(uFogColor, uAmbientSky * (0.45 * uAmbientIntensity), clamp(R.y * 1.4, 0.0, 1.0));
    sky += uGlow * (uGlowStrength * 0.5 * pow(max(dot(bearing, sunBearing), 0.0), 5.0) * (1.0 - clamp(R.y * 3.0, 0.0, 1.0)));
    // Below the horizon a window reflects the darker ground.
    sky = mix(sky, uAmbientGround * 0.35, smoothstep(0.0, -0.25, R.y));
    return sky;
  }

  vec3 palette5(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
    return t < 0.2 ? a : t < 0.4 ? b : t < 0.6 ? c : t < 0.8 ? d : e;
  }

  // A flat roof seen from above: membrane or gravel, a parapet round the
  // edge, and the hatches, vents and pipe runs every roof collects.
  vec3 flatRoof(float seed, float coarse) {
    float tone = fract(seed * 13.0);
    vec3 base = tone < 0.3 ? vec3(0.42, 0.42, 0.4)
      : tone < 0.45 ? vec3(0.56, 0.56, 0.54)
      : tone < 0.55 ? vec3(0.1, 0.15, 0.07)
      : tone < 0.8 ? vec3(0.2, 0.2, 0.2)
      : vec3(0.3, 0.26, 0.22);
    base *= 0.86 + 0.28 * valueNoise(vLocal.xz / 5.0 + seed * 31.0);
    float edge = min(vSize.x * 0.5 - abs(vLocal.x), vSize.z * 0.5 - abs(vLocal.z));
    float aa = max(fwidth(vLocal.x), fwidth(vLocal.z)) + 1e-3;
    // Coping on the parapet, then the shadow it throws on the roof.
    base = mix(base, vec3(0.5, 0.5, 0.48), (1.0 - smoothstep(0.45 - aa, 0.45 + aa, edge)) * (1.0 - coarse));
    base *= mix(1.0, 0.72, band(edge, 0.45, 1.5, aa) * (1.0 - coarse));
    // Scattered roof furniture on a coarse grid.
    vec2 cell = floor(vLocal.xz / 7.0);
    vec2 inCell = fract(vLocal.xz / 7.0);
    float pick = hash21(cell + seed * 57.0);
    float item = band(inCell.x, 0.3, 0.3 + 0.2 + 0.3 * pick, aa / 7.0) * band(inCell.y, 0.3, 0.62, aa / 7.0)
      * step(0.62, pick) * step(2.5, edge);
    vec3 itemColor = pick > 0.85 ? vec3(0.1, 0.14, 0.18) : vec3(0.52, 0.53, 0.54);
    return mix(base, itemColor, item * (1.0 - coarse));
  }

  void main() {
    int kind = int(vStyle.x + 0.5);
    float seed = vStyle.y;
    int shape = int(vStyle.z + 0.5);
    bool isBox = shape == ${S.box};
    bool isGable = shape == ${S.gable};
    bool rounded = !isBox && !isGable && shape != ${S.pyramid} && shape != ${S.arch};
    vec3 N = normalize(vNormal);
    vec3 toCamera = cameraPosition - vWorld;
    float viewDistance = length(toCamera);
    vec3 V = toCamera / viewDistance;
    bool top = isBox ? vObjectNormal.y > 0.5 : (shape == ${S.cylinder} || shape == ${S.taper} || shape == ${S.cooling}) && vObjectNormal.y > 0.9;
    bool bottom = vObjectNormal.y < -0.5;

    // Facade coordinates in metres: along the wall, and up from the base.
    float u = rounded
      ? atan(vLocal.z, vLocal.x) * vSize.x * 0.5
      : (abs(vObjectNormal.x) > abs(vObjectNormal.z) ? vLocal.z : vLocal.x);
    float v = vLocal.y;
    float aaU = fwidth(u) + 1e-3;
    float aaV = fwidth(v) + 1e-3;
    // The atan seam would otherwise read as a huge derivative.
    if (rounded) aaU = min(aaU, length(vec2(fwidth(vLocal.x), fwidth(vLocal.z))) + 1e-3);
    float coarse = smoothstep(0.35, 1.2, max(aaU, aaV));
    float wallHalf = abs(vObjectNormal.x) > abs(vObjectNormal.z) ? vSize.z * 0.5 : vSize.x * 0.5;

    vec3 albedo = vec3(0.3);
    float glass = 0.0;
    vec3 glassTint = vec3(0.05, 0.07, 0.08);
    // Shininess of the opaque surface, for a sun highlight on metal.
    float sheen = 0.0;
    // Lit windows, as radiance added after lighting.
    vec3 glow = vec3(0.0);
    float lamps = smoothstep(0.16, 0.6, uLamps);
    vec3 warm = vec3(1.0, 0.74, 0.42);

    if (kind == ${K.tower}) {
      glassTint = palette5(seed, vec3(0.035, 0.07, 0.095), vec3(0.055, 0.06, 0.065), vec3(0.085, 0.07, 0.045),
        vec3(0.04, 0.085, 0.08), vec3(0.06, 0.075, 0.105));
      vec3 frame = palette5(fract(seed * 7.0), vec3(0.44), vec3(0.2), vec3(0.56, 0.53, 0.47), vec3(0.13), vec3(0.36, 0.39, 0.43));
      float style = fract(seed * 3.0);
      float floorH = 3.9;
      float bay = style < 0.4 ? 1.5 : style < 0.75 ? 3.0 : 1.2;
      float fv = fract(v / floorH);
      float fu = fract(u / bay + 0.5);
      float cu = blur(aaU, bay);
      float cv = blur(aaV, floorH);
      // Spandrel panels between floors and mullions between bays. Towers
      // differ in which of the two is the stronger line.
      float spandrelDepth = style < 0.4 ? 0.24 : style < 0.75 ? 0.36 : 0.14;
      float mullionWidth = style < 0.4 ? 0.1 : style < 0.75 ? 0.07 : 0.2;
      float spandrel = mix(band(fv, -0.05, spandrelDepth, aaV / floorH), spandrelDepth, cv);
      float mullion = mix(band(fu, -0.05, mullionWidth, aaU / bay), mullionWidth, cu);
      glass = (1.0 - spandrel) * (1.0 - mullion);
      albedo = frame;
      // Solid corners and a taller ground floor.
      glass *= 1.0 - (1.0 - smoothstep(0.5, 0.9, wallHalf - abs(u))) * 0.85;
      float lobby = 1.0 - smoothstep(5.2, 5.6, v);
      glass = mix(glass, 0.86, lobby * (1.0 - cu));
      vec2 pane = floor(vec2(u / bay + 0.5, v / floorH));
      float lit = step(hash21(pane * vec2(0.37, 1.0) + seed * 19.0), 0.42 * uLamps) * (1.0 - cv);
      glow = warm * (lit * glass * lamps * 1.5);
      if (top) { albedo = flatRoof(seed, coarse); glass = 0.0; glow = vec3(0.0); }
    } else if (kind == ${K.office}) {
      float material = fract(seed * 5.0);
      // Brick, stone, render or concrete.
      albedo = palette5(seed, vec3(0.44, 0.42, 0.39), vec3(0.5, 0.43, 0.33), vec3(0.6, 0.59, 0.56),
        vec3(0.34, 0.17, 0.12), vec3(0.33, 0.33, 0.34));
      float floorH = 3.4;
      float bay = material < 0.5 ? 3.1 : 2.2;
      float fv = fract(v / floorH);
      float fu = fract(u / bay + 0.5);
      float cu = blur(aaU, bay);
      float cv = blur(aaV, floorH);
      float sill = 0.3;
      float head = 0.84;
      float jamb = material < 0.5 ? 0.17 : 0.1;
      float across = mix(band(fu, jamb, 1.0 - jamb, aaU / bay), 1.0 - 2.0 * jamb, cu);
      float up = mix(band(fv, sill, head, aaV / floorH), head - sill, cv);
      float window = across * up;
      window *= step(3.7, v) * step(v, vSize.y - 1.1);
      glass = window;
      // Brick courses or panel joints, where they can be seen.
      if (material < 0.5) albedo *= 1.0 - 0.07 * (1.0 - blur(aaV, 0.3)) * step(0.82, fract(v / 0.3));
      else albedo *= 1.0 - 0.09 * (1.0 - cv) * (1.0 - band(fv, 0.03, 0.97, aaV / floorH));
      // Shopfronts at street level under a signboard band.
      float shop = 1.0 - smoothstep(3.0, 3.2, v);
      float shopBay = fract(u / 6.2 + 0.5);
      float shopGlass = band(shopBay, 0.07, 0.93, aaU / 6.2) * band(v, 0.5, 2.9, aaV);
      glass = mix(glass, mix(shopGlass, 0.75, blur(aaU, 6.2)), shop);
      vec3 sign = palette5(hash21(vec2(floor(u / 6.2 + 0.5), seed * 40.0)), vec3(0.12, 0.2, 0.3), vec3(0.4, 0.1, 0.07),
        vec3(0.1), vec3(0.42, 0.34, 0.12), vec3(0.14, 0.26, 0.16));
      albedo = mix(albedo, mix(sign, albedo * 0.7, blur(aaU, 6.2)), band(v, 3.05, 3.7, aaV));
      // Cornice.
      albedo = mix(albedo, albedo * 1.25 + 0.03, smoothstep(vSize.y - 0.9, vSize.y - 0.7, v));
      vec2 pane = floor(vec2(u / bay + 0.5, v / floorH));
      float lit = step(hash21(pane + seed * 23.0), 0.5 * uLamps) * (1.0 - max(cu, cv));
      glow = warm * (lit * glass * lamps * 1.4);
      if (top) { albedo = flatRoof(seed, coarse); glass = 0.0; glow = vec3(0.0); }
    } else if (kind == ${K.residential}) {
      albedo = palette5(seed, vec3(0.66, 0.64, 0.6), vec3(0.6, 0.52, 0.42), vec3(0.5, 0.5, 0.5),
        vec3(0.55, 0.38, 0.29), vec3(0.7, 0.68, 0.62));
      float floorH = 3.0;
      float bay = 5.6;
      float fv = fract(v / floorH);
      float fu = fract(u / bay + 0.5);
      float cu = blur(aaU, bay);
      float cv = blur(aaV, floorH);
      // Each bay is a window and a recessed balcony behind a glazed rail.
      float balcony = step(0.5, fu);
      float opening = mix(band(fu, 0.08, 0.42, aaU / bay) + band(fu, 0.55, 0.95, aaU / bay), 0.74, cu)
        * mix(band(fv, 0.26, 0.86, aaV / floorH), 0.6, cv);
      float slab = mix(band(fv, -0.04, 0.09, aaV / floorH), 0.13, cv);
      float rail = band(fv, 0.09, 0.4, aaV / floorH) * balcony * band(fu, 0.53, 0.97, aaU / bay) * (1.0 - cu) * (1.0 - cv);
      glass = opening * (1.0 - slab) * step(0.3, v) * step(v, vSize.y - 0.8);
      // Balcony recesses sit in their own shade.
      albedo *= 1.0 - 0.22 * balcony * (1.0 - cu) * band(fv, 0.09, 0.95, aaV / floorH);
      albedo = mix(albedo, vec3(0.74, 0.73, 0.7), slab);
      glass = max(glass * (1.0 - rail), rail * 0.55);
      vec2 pane = floor(vec2(u / bay * 2.0 + 1.0, v / floorH));
      float lit = step(hash21(pane + seed * 29.0), 0.62 * uLamps) * (1.0 - max(cu, cv));
      glow = warm * (lit * glass * lamps * 1.3);
      if (top) { albedo = flatRoof(seed, coarse); glass = 0.0; glow = vec3(0.0); }
    } else if (kind == ${K.industrial}) {
      albedo = palette5(seed, vec3(0.5, 0.51, 0.52), vec3(0.22, 0.29, 0.37), vec3(0.6, 0.6, 0.57),
        vec3(0.26, 0.33, 0.29), vec3(0.42, 0.39, 0.34));
      // Profiled cladding: fine vertical ribs, sheet laps every few metres.
      float ribs = 0.5 + 0.5 * sin(u * 7.85);
      albedo *= 1.0 + 0.09 * (ribs - 0.5) * (1.0 - blur(aaU, 0.8));
      albedo *= 1.0 - 0.06 * (1.0 - blur(aaV, 3.0)) * (1.0 - band(fract(v / 3.0), 0.03, 0.97, aaV / 3.0));
      // A coloured band under the eaves, and a concrete plinth.
      vec3 accent = palette5(fract(seed * 9.0), vec3(0.08, 0.2, 0.4), vec3(0.45, 0.1, 0.06), vec3(0.5, 0.4, 0.08),
        vec3(0.1, 0.3, 0.2), vec3(0.14));
      albedo = mix(albedo, accent, band(v, vSize.y - 2.6, vSize.y - 1.2, aaV) * step(0.35, fract(seed * 4.0)));
      albedo = mix(albedo, vec3(0.36, 0.36, 0.35), 1.0 - smoothstep(1.1, 1.3, v));
      // Loading doors along the long sides, a strip of glazing above them.
      float doorBay = fract(u / 13.0 + 0.5);
      float door = band(doorBay, 0.28, 0.72, aaU / 13.0) * band(v, 0.4, 5.6, aaV) * step(0.3, fract(seed * 3.0))
        * step(40.0, wallHalf * 2.0);
      vec3 doorColor = mix(vec3(0.62, 0.63, 0.64), vec3(0.2, 0.22, 0.25), step(0.5, hash21(vec2(floor(u / 13.0 + 0.5), seed * 77.0))));
      doorColor *= 1.0 - 0.14 * (1.0 - blur(aaV, 0.5)) * step(0.5, fract(v / 0.5));
      albedo = mix(albedo, mix(doorColor, albedo, blur(aaU, 13.0) * 0.6), door);
      float strip = band(v, vSize.y - 5.4, vSize.y - 3.6, aaV) * step(0.5, seed);
      glass = strip * (1.0 - coarse * 0.5) * (1.0 - door);
      sheen = 0.25;
      if (top) { albedo = flatRoof(seed, coarse); glass = 0.0; sheen = 0.0; }
    } else if (kind == ${K.terminal}) {
      albedo = vec3(0.5, 0.5, 0.49);
      float fv = fract(v / 4.5);
      float fu = fract(u / 2.4 + 0.5);
      float cu = blur(aaU, 2.4);
      float cv = blur(aaV, 4.5);
      glass = (1.0 - mix(band(fv, -0.05, 0.12, aaV / 4.5), 0.17, cv)) * (1.0 - mix(band(fu, -0.05, 0.05, aaU / 2.4), 0.1, cu));
      // A plinth below and a deep fascia above the glazing.
      glass *= step(0.8, v) * (1.0 - smoothstep(vSize.y - 1.7, vSize.y - 1.5, v));
      vec2 pane = floor(vec2(u / 2.4 + 0.5, v / 4.5));
      float lit = step(hash21(pane * vec2(0.2, 1.0) + seed * 11.0), 0.25 + 0.6 * uLamps);
      glow = warm * vec3(0.95, 1.0, 1.1) * (lit * glass * lamps * 1.5);
      if (top) { albedo = vec3(0.4); glass = 0.0; glow = vec3(0.0); }
    } else if (kind == ${K.tank}) {
      albedo = palette5(seed, vec3(0.74, 0.74, 0.72), vec3(0.66, 0.67, 0.68), vec3(0.72, 0.7, 0.62),
        vec3(0.6, 0.66, 0.62), vec3(0.78, 0.78, 0.77));
      sheen = 0.5;
      if (shape == ${S.cylinder}) {
        // Rings of plate, with rust weeping from the seams.
        float course = 2.4;
        albedo *= 1.0 - 0.1 * (1.0 - blur(aaV, course)) * (1.0 - band(fract(v / course), 0.04, 0.96, aaV / course));
        float streak = valueNoise(vec2(u * 0.9, v * 0.06) + seed * 50.0);
        albedo = mix(albedo, vec3(0.34, 0.2, 0.12), 0.26 * smoothstep(0.62, 0.9, streak) * (1.0 - coarse * 0.6));
        // A spiral stair climbing the shell, and the wind girder at the rim.
        float around = 3.14159 * vSize.x;
        float stair = band(mod(u - v * 2.1 + around * 8.0, around), 0.0, 1.3, aaU + aaV * 2.1);
        albedo = mix(albedo, vec3(0.2, 0.21, 0.22), stair * (1.0 - blur(aaU, 1.3)) * 0.85);
        albedo = mix(albedo, albedo * 0.6, band(v, vSize.y - 0.9, vSize.y - 0.5, aaV));
        // A colour band, as on fuel and water tanks.
        vec3 mark = palette5(fract(seed * 11.0), vec3(0.1, 0.24, 0.5), vec3(0.5, 0.1, 0.07), vec3(0.1, 0.34, 0.2),
          vec3(0.55, 0.42, 0.08), vec3(0.2));
        albedo = mix(albedo, mark, band(v, vSize.y - 2.6, vSize.y - 1.5, aaV) * step(0.4, fract(seed * 6.0)));
        if (top) albedo = vec3(0.5, 0.5, 0.49);
      } else if (shape == ${S.sphere}) {
        albedo = mix(albedo, albedo * 0.75, band(v, vSize.y * 0.48, vSize.y * 0.52, aaV));
      } else {
        // Roof plates radiating from the crown, and the vent at the centre.
        float sector = fract(atan(vLocal.z, vLocal.x) * 3.8197 + 0.5);
        float radius = length(vLocal.xz);
        albedo *= 0.93 - 0.08 * (1.0 - coarse) * (1.0 - band(sector, 0.03, 0.97, 0.02 + aaU / max(radius, 0.5)));
        albedo = mix(albedo, vec3(0.22), 1.0 - smoothstep(0.6, 0.9, radius));
        albedo = mix(albedo, albedo * 0.62, smoothstep(vSize.x * 0.47, vSize.x * 0.49, radius));
      }
    } else if (kind == ${K.containers}) {
      // One instance is a row of containers, stacked: colour each box.
      float along = vLocal.x + vSize.x * 0.5;
      float box = floor(along / 12.2);
      float tier = floor(v / 2.6);
      float r = hash21(vec2(box, tier) + seed * 91.0);
      albedo = palette5(r, vec3(0.34, 0.09, 0.05), vec3(0.05, 0.14, 0.32), vec3(0.08, 0.22, 0.13),
        vec3(0.5, 0.2, 0.04), vec3(0.5, 0.5, 0.48));
      float seam = (1.0 - band(fract(along / 12.2), 0.015, 0.985, aaU / 12.2)) + (1.0 - band(fract(v / 2.6), 0.03, 0.97, aaV / 2.6));
      albedo *= 1.0 - 0.55 * clamp(seam, 0.0, 1.0) * (1.0 - coarse);
      albedo *= 1.0 + 0.1 * (sin(along * 9.0) * (1.0 - coarse));
      if (top) {
        // Lanes between trailers when the row is a line of parked trucks.
        float across = fract((vLocal.z + vSize.z * 0.5) / 2.9);
        albedo *= 0.9 - 0.4 * step(6.0, vSize.z) * (1.0 - band(across, 0.08, 0.92, 0.03)) * (1.0 - coarse);
      }
      sheen = 0.2;
    } else if (kind == ${K.bridge}) {
      albedo = vec3(0.4, 0.395, 0.38);
      if (top) {
        // Carriageway with lane lines, kerbs and footways.
        float z = abs(vLocal.z);
        float aaZ = fwidth(vLocal.z) + 1e-3;
        albedo = vec3(0.07, 0.072, 0.076) * (0.9 + 0.2 * valueNoise(vLocal.xz * 0.7));
        float dashed = step(0.5, fract(vLocal.x / 12.0));
        float lane = band(z, 3.4, 3.62, aaZ) * dashed + band(z, 0.0, 0.12, aaZ);
        albedo = mix(albedo, vec3(0.6, 0.6, 0.56), lane * (1.0 - blur(aaZ, 0.6)));
        albedo = mix(albedo, vec3(0.6, 0.6, 0.56), band(z, 7.15, 7.3, aaZ) * (1.0 - blur(aaZ, 0.6)));
        albedo = mix(albedo, vec3(0.34, 0.335, 0.32), smoothstep(7.6 - aaZ, 7.6 + aaZ, z));
      } else if (!bottom) {
        // Edge girder, with the shadow line under the deck.
        albedo *= 0.75 + 0.25 * smoothstep(0.3, 0.9, v);
        albedo *= 1.0 - 0.1 * (1.0 - blur(aaU, 15.0)) * (1.0 - band(fract(u / 15.0), 0.01, 0.99, aaU / 15.0));
      }
      if (bottom) albedo *= 0.45;
    } else if (kind == ${K.stack}) {
      albedo = mix(vec3(0.42, 0.41, 0.39), vec3(0.4, 0.24, 0.18), step(0.55, seed));
      // Lifts of the pour, or brick banding.
      albedo *= 1.0 - 0.08 * (1.0 - blur(aaV, 2.5)) * (1.0 - band(fract(v / 2.5), 0.05, 0.95, aaV / 2.5));
      // Aviation markings: red and white bands near the top.
      float fromTop = vSize.y - v;
      float marked = 1.0 - smoothstep(18.0 - aaV, 18.0 + aaV, fromTop);
      float stripe = step(0.5, fract(fromTop / 6.0));
      albedo = mix(albedo, mix(vec3(0.55, 0.07, 0.045), vec3(0.66, 0.66, 0.64), stripe), marked);
      // Soot at the lip, a ladder cage up one side.
      albedo *= mix(1.0, 0.5, 1.0 - smoothstep(0.0, 2.5, fromTop));
      float around = 3.14159 * vSize.x;
      albedo = mix(albedo, vec3(0.16), band(mod(u + around, around), 0.0, 0.6, aaU) * (1.0 - blur(aaU, 0.6)) * 0.7);
      if (top) albedo = vec3(0.03);
    } else if (kind == ${K.roof}) {
      vec3 tile = palette5(seed, vec3(0.36, 0.15, 0.09), vec3(0.14, 0.14, 0.15), vec3(0.3, 0.31, 0.32),
        vec3(0.27, 0.13, 0.09), vec3(0.2, 0.17, 0.14));
      if (isGable && abs(vObjectNormal.z) > 0.9) {
        // Gable end: the wall carried up to the ridge.
        albedo = palette5(fract(seed * 7.0), vec3(0.6, 0.58, 0.54), vec3(0.52, 0.45, 0.36), vec3(0.5), vec3(0.5, 0.36, 0.28), vec3(0.64, 0.62, 0.57));
      } else {
        // Courses of tile running along the slope, with weathering.
        float course = v / max(abs(vObjectNormal.y), 0.3) ;
        albedo = tile * (0.84 + 0.3 * valueNoise(vec2(vLocal.z, vLocal.x) * 0.8 + seed * 9.0));
        albedo *= 1.0 - 0.16 * (1.0 - blur(aaV, 0.35)) * step(0.7, fract(course / 0.35));
        // Ridge capping.
        albedo = mix(albedo, tile * 0.6, smoothstep(vSize.y - 0.35, vSize.y - 0.2, v));
        // The odd rooflight and chimney stack.
        vec2 cell = floor(vec2(vLocal.z / 5.5, sign(vLocal.x)));
        float pick = hash21(cell + seed * 61.0);
        float item = band(fract(vLocal.z / 5.5), 0.35, 0.6, aaU / 5.5) * band(v / max(vSize.y, 0.1), 0.3, 0.6, aaV / max(vSize.y, 0.1))
          * step(0.72, pick) * (1.0 - coarse);
        albedo = mix(albedo, pick > 0.88 ? vec3(0.4, 0.3, 0.25) : vec3(0.06, 0.08, 0.1), item);
        sheen = 0.12;
      }
    } else if (kind == ${K.metalRoof}) {
      vec3 sheet = palette5(seed, vec3(0.6, 0.61, 0.62), vec3(0.5, 0.53, 0.56), vec3(0.3, 0.36, 0.33),
        vec3(0.66, 0.66, 0.64), vec3(0.4, 0.42, 0.45));
      if (isGable && abs(vObjectNormal.z) > 0.9) {
        albedo = sheet * 0.8;
      } else {
        float alongRidge = isGable ? vLocal.z : u;
        albedo = sheet * (0.9 + 0.2 * valueNoise(vec2(alongRidge * 0.15, v) + seed * 13.0));
        // Standing seams down the slope, and strips of translucent rooflight.
        float seam = 1.0 - band(fract(alongRidge / 1.1), 0.08, 0.92, aaU / 1.1 + 0.02);
        albedo *= 1.0 - 0.12 * seam * (1.0 - blur(max(aaU, fwidth(alongRidge)), 1.1));
        float light = band(fract(alongRidge / 13.0), 0.4, 0.52, fwidth(alongRidge) / 13.0)
          * step(0.25, fract(seed * 5.0)) * float(isGable);
        albedo = mix(albedo, vec3(0.72, 0.76, 0.74), light * (1.0 - blur(fwidth(alongRidge), 6.0)) * 0.8);
        albedo = mix(albedo, sheet * 0.6, smoothstep(vSize.y - 0.4, vSize.y - 0.2, v) * float(isGable));
        sheen = 0.7;
      }
    } else if (kind == ${K.plant}) {
      albedo = mix(vec3(0.5, 0.51, 0.52), vec3(0.34, 0.35, 0.36), step(0.5, seed));
      // Louvred sides, fans on top.
      albedo *= 1.0 - 0.22 * (1.0 - blur(aaV, 0.35)) * step(0.5, fract(v / 0.35)) * step(0.4, v);
      if (top) {
        vec2 q = vLocal.xz / max(min(vSize.x, vSize.z), 0.1);
        float fan = 1.0 - smoothstep(0.26, 0.3, length(fract(q * 1.0 + 0.5) - 0.5));
        albedo = mix(albedo * 0.9, vec3(0.08), fan * (1.0 - coarse) * 0.8);
      }
      sheen = 0.3;
    } else if (kind == ${K.concrete}) {
      albedo = vec3(0.5, 0.49, 0.47) * (0.86 + 0.28 * valueNoise(vec2(u, v) / 6.0 + seed * 17.0));
      // Lift lines from the formwork, and stains running down from the top.
      albedo *= 1.0 - 0.07 * (1.0 - blur(aaV, 2.4)) * (1.0 - band(fract(v / 2.4), 0.04, 0.96, aaV / 2.4));
      float streak = valueNoise(vec2(u * 0.35, v * 0.03) + seed * 70.0);
      albedo *= 1.0 - 0.2 * smoothstep(0.55, 0.9, streak);
      if (shape == ${S.cooling}) {
        // The shell is ribbed and stands on a ring of columns.
        albedo *= 1.0 - 0.06 * (1.0 - blur(aaU, 2.2)) * step(0.5, fract(u / 2.2));
        float legs = (1.0 - smoothstep(vSize.y * 0.07, vSize.y * 0.075, v)) * step(0.45, fract(u / 4.0));
        albedo = mix(albedo, vec3(0.03), legs * (1.0 - blur(aaU, 4.0)));
        if (top) albedo = vec3(0.045);
      }
    } else if (kind == ${K.steel}) {
      albedo = seed < 0.2 ? vec3(0.62, 0.62, 0.6)
        : seed < 0.45 ? vec3(0.3, 0.36, 0.4)
        : seed < 0.6 ? vec3(0.42, 0.16, 0.1)
        : seed < 0.8 ? vec3(0.36, 0.4, 0.36)
        : vec3(0.62, 0.42, 0.06);
      // Masts carry red and white bands.
      if (seed < 0.1) albedo = mix(vec3(0.58, 0.08, 0.05), vec3(0.68), step(0.5, fract(v / 4.0)));
      albedo *= 0.9 + 0.2 * valueNoise(vec2(u, v) * 0.5);
      sheen = 0.4;
    }

    // Variation between individual panels and buildings.
    albedo *= 0.9 + 0.2 * valueNoise(vec2(u, v) / 9.0 + seed * 40.0);
    // Sharpen the arrises: a wall is slightly weathered toward its corners.
    if (isBox && !top && !bottom) {
      albedo *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 0.7, wallHalf - abs(u))) * (1.0 - coarse);
    }
    // Contact darkening where walls meet whatever they stand on.
    if (!top) albedo *= mix(0.6, 1.0, smoothstep(0.0, 5.0, v));

    float lit = sunShadow(vWorld, N);
    vec3 color = surfaceLightShadowed(albedo, N, lit);
    vec3 H = normalize(V + uSunDirection);
    float facing = max(dot(N, uSunDirection), 0.0);
    if (sheen > 0.0) {
      color += uSunColor * (uSunIntensity * lit * facing * sheen * 0.07 * pow(max(dot(N, H), 0.0), 24.0));
    }
    if (glass > 0.001) {
      vec3 R = reflect(-V, N);
      // Each pane reflects slightly differently.
      float pane = hash21(floor(vec2(u / 1.5, v / 3.9)) + seed * 13.0);
      float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 body = surfaceLightShadowed(glassTint, N, lit);
      vec3 reflection = skyReflection(R) * (0.75 + 0.35 * mix(pane, 0.5, coarse));
      // The sun itself, glancing off the glazing.
      reflection += uSunColor * (pow(max(dot(R, uSunDirection), 0.0), 180.0) * uSunIntensity * 1.6 * lit);
      vec3 glazing = mix(body, reflection, clamp(0.5 + 0.5 * fresnel, 0.0, 1.0));
      color = mix(color, glazing, glass);
    }
    color += glow;

    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

type StructureUniforms = LightingUniforms & { uLamps: THREE.IUniform<number> };

/** One material for every structure, compiled once and kept. */
let shared: { material: THREE.ShaderMaterial; uniforms: StructureUniforms } | null = null;

function structureMaterial() {
  if (!shared) {
    const uniforms: StructureUniforms = { ...createLightingUniforms(), uLamps: { value: 0 } };
    shared = {
      uniforms,
      material: new THREE.ShaderMaterial({
        uniforms: { ...(uniforms as unknown as Record<string, THREE.IUniform>), ...shadowUniforms },
        vertexShader,
        fragmentShader,
      }),
    };
  }
  return shared;
}

// ---------------------------------------------------------------------------
// Unit solids
// ---------------------------------------------------------------------------

/** Builds a flat-shaded geometry from triangles given as corner triples. */
function facets(triangles: readonly (readonly [number, number, number])[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(triangles.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Triangular prism: eaves at x = ±0.5, ridge along Z at height 1. */
function gableGeometry(): THREE.BufferGeometry {
  const a = [-0.5, 0, -0.5] as const;
  const b = [0.5, 0, -0.5] as const;
  const c = [0, 1, -0.5] as const;
  const d = [-0.5, 0, 0.5] as const;
  const e = [0.5, 0, 0.5] as const;
  const f = [0, 1, 0.5] as const;
  return facets([a, c, b, d, e, f, a, d, f, a, f, c, b, c, f, b, f, e]);
}

/** Semi-elliptical arch rib: springs from x = ±0.5 and rises to height 1. */
function archGeometry(): THREE.BufferGeometry {
  const segments = 28;
  const triangles: [number, number, number][] = [];
  const point = (i: number, inner: boolean, z: number): [number, number, number] => {
    const angle = (Math.PI * i) / segments;
    return [0.5 * (inner ? 0.975 : 1) * Math.cos(angle), (inner ? 0.9 : 1) * Math.sin(angle), z];
  };
  const quad = (
    p: [number, number, number],
    q: [number, number, number],
    r: [number, number, number],
    s: [number, number, number],
  ) => triangles.push(p, q, r, p, r, s);
  for (let i = 0; i < segments; i++) {
    // Outer face, inner face, then the two sides. Angles run from +X to -X.
    quad(point(i, false, 0.5), point(i, false, -0.5), point(i + 1, false, -0.5), point(i + 1, false, 0.5));
    quad(point(i, true, -0.5), point(i, true, 0.5), point(i + 1, true, 0.5), point(i + 1, true, -0.5));
    quad(point(i, true, 0.5), point(i, false, 0.5), point(i + 1, false, 0.5), point(i + 1, true, 0.5));
    quad(point(i, false, -0.5), point(i, true, -0.5), point(i + 1, true, -0.5), point(i + 1, false, -0.5));
  }
  return facets(triangles);
}

/** Hyperboloid shell of a cooling tower, with a dark disc just inside its rim. */
function coolingGeometry(): THREE.BufferGeometry {
  const radius = (y: number) => 0.5 * Math.sqrt(0.36 + 0.64 * ((y - 0.7) / 0.7) ** 2);
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) points.push(new THREE.Vector2(radius(i / 16), i / 16));
  const shell = new THREE.LatheGeometry(points, 32);
  const cap = new THREE.CircleGeometry(radius(0.97), 32).rotateX(-Math.PI / 2).translate(0, 0.97, 0);
  const merged = mergeGeometries([shell, cap]);
  shell.dispose();
  cap.dispose();
  return merged;
}

const builders: Record<StructureShape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1).translate(0, 0.5, 0),
  gable: gableGeometry,
  pyramid: () => {
    const cone = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    const flat = cone.toNonIndexed();
    flat.computeVertexNormals();
    cone.dispose();
    return flat;
  },
  dome: () => new THREE.SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 24, 16).translate(0, 0.5, 0),
  cone: () => new THREE.ConeGeometry(0.5, 1, 24, 1, true).translate(0, 0.5, 0),
  taper: () => new THREE.CylinderGeometry(0.3, 0.5, 1, 20, 1).translate(0, 0.5, 0),
  cooling: coolingGeometry,
  arch: archGeometry,
};

/** Unit solids standing on their base; instances scale them to size. */
const unitGeometries = new Map<StructureShape, THREE.BufferGeometry>();

function unitGeometry(shape: StructureShape): THREE.BufferGeometry {
  let geometry = unitGeometries.get(shape);
  if (!geometry) {
    geometry = builders[shape]();
    unitGeometries.set(shape, geometry);
  }
  return geometry;
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _rotation = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function buildInstances(
  items: readonly Structure[],
  shape: StructureShape,
  material: THREE.Material,
): THREE.InstancedMesh {
  // A per-mesh attribute: the shared geometry must not carry it.
  const geometry = unitGeometry(shape).clone();
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const styles = new Float32Array(items.length * 3);
  items.forEach((item, index) => {
    _position.set(item.x, item.y, item.z);
    _rotation.setFromAxisAngle(_up, item.rotation);
    _scale.set(item.width, item.height, item.depth);
    mesh.setMatrixAt(index, _matrix.compose(_position, _rotation, _scale));
    styles.set([STRUCTURE_KINDS[item.kind], item.seed, STRUCTURE_SHAPES[shape]], index * 3);
  });
  geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  mesh.layers.enable(SHADOW_LAYER);
  return mesh;
}

/**
 * Shows a set of buildings only once their shader has compiled, in the
 * background. Drawing them before then would freeze the page while the
 * driver compiles (over a second on Direct3D). Returns a cancel function.
 */
function revealWhenCompiled(
  group: THREE.Group,
  gl: THREE.WebGLRenderer,
  camera: THREE.Camera,
  scene: THREE.Scene,
): () => void {
  let cancelled = false;
  group.visible = false;
  gl.compileAsync(group, camera, scene)
    .catch(() => undefined)
    .then(() => {
      if (cancelled) return;
      group.visible = true;
      invalidateSunShadows();
    });
  return () => {
    cancelled = true;
  };
}

interface StructuresProps {
  items: readonly Structure[];
}

/**
 * Draws a set of structures as one instanced mesh per unit solid, all
 * sharing one shader, so a whole city is a handful of draw calls.
 */
export function Structures({ items }: StructuresProps) {
  const built = useMemo(() => {
    const { material } = structureMaterial();
    const group = new THREE.Group();
    const byShape = new Map<StructureShape, Structure[]>();
    for (const item of items) {
      const list = byShape.get(item.shape);
      if (list) list.push(item);
      else byShape.set(item.shape, [item]);
    }
    const meshes: THREE.InstancedMesh[] = [];
    for (const [shape, list] of byShape) {
      const mesh = buildInstances(list, shape, material);
      meshes.push(mesh);
      group.add(mesh);
    }
    return { group, meshes };
  }, [items]);

  const { gl, camera, scene } = useThree();

  useEffect(() => {
    const cancel = revealWhenCompiled(built.group, gl, camera, scene);
    return () => {
      cancel();
      for (const mesh of built.meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      invalidateSunShadows();
    };
  }, [built, gl, camera, scene]);

  useFrame(() => {
    const { uniforms } = structureMaterial();
    updateLightingUniforms(uniforms, flightFrame.atmosphere);
    uniforms.uLamps.value = flightFrame.atmosphere.lamps;
  });

  return <primitive object={built.group} />;
}
