/**
 * Generates the SR-01 executive jet as an optimized GLB.
 *
 *   node scripts/build-aircraft.mjs
 *
 * The aircraft is modelled procedurally because no modelling tool or licensed
 * model is available for this project. Everything is derived from the
 * dimensions below, so proportions can be tuned and the file regenerated.
 *
 * Conventions (metres, glTF axes):
 *   +Z nose, +Y up, +X left wing.
 *   Origin on the ground under the main landing gear, so pitching the root
 *   node rotates the aircraft about its main wheels (takeoff rotation).
 *
 * Node names are a contract with src/flight/aircraft.ts. Any model that
 * follows the same names can replace this one.
 */

import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import {
  EXTMeshoptCompression,
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRMeshQuantization,
} from "@gltf-transform/extensions";
import { dedup, meshopt, prune } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const OUT_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/sr-01.glb");

// ---------------------------------------------------------------------------
// Principal dimensions
// ---------------------------------------------------------------------------

const LENGTH = 21;
const NOSE_Z = 10.9;
/**
 * Height of the fuselage centreline in the airframe's own coordinates. The
 * airframe was drawn sitting low; BODY_LIFT raises it onto landing gear of
 * realistic length, so the centreline stands CENTER_Y + BODY_LIFT above the
 * ground.
 */
const CENTER_Y = 1.95;
const BODY_LIFT = 0.55;
const DEG = Math.PI / 180;

const zAt = (t) => NOSE_Z - t * LENGTH;
const tAt = (z) => (NOSE_Z - z) / LENGTH;

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Monotone cubic interpolation (Fritsch–Carlson): smooth, never overshoots. */
function monotoneCubic(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      m[i] = k * a * d[i];
      m[i + 1] = k * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Builds an indexed geometry from flat arrays and computes smooth normals. */
function geometryFrom(positions, indices, normals) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  if (normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  else geometry.computeVertexNormals();
  return geometry;
}

/** Reverses triangle winding and negates normals. */
function flip(geometry) {
  const index = geometry.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    index.setX(i, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  const normal = geometry.getAttribute("normal");
  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  }
  return geometry;
}

/**
 * Makes triangle winding agree with the vertex normals already stored on the
 * geometry (used for surfaces whose normals are computed analytically).
 */
function windToNormals(geometry) {
  const index = geometry.getIndex();
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const face = new THREE.Vector3();
  let agree = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ia = index.getX(i);
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    face.crossVectors(b.sub(a), c.sub(a));
    n.fromBufferAttribute(nor, ia);
    agree += Math.sign(face.dot(n));
  }
  if (agree < 0) {
    for (let i = 0; i < index.count; i += 3) {
      const ia = index.getX(i);
      index.setX(i, index.getX(i + 2));
      index.setX(i + 2, ia);
    }
  }
  return geometry;
}

/**
 * Orients a closed or open surface so normals point the way `outward` says.
 * `outward(position)` returns the direction normals should roughly follow.
 */
function orient(geometry, outward) {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  let sum = 0;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    sum += n.dot(outward(p));
  }
  return sum < 0 ? flip(geometry) : geometry;
}

/** Strips attributes other than position and normal so parts can be merged. */
function clean(geometry) {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }
  if (!geometry.getIndex()) {
    const count = geometry.getAttribute("position").count;
    geometry.setIndex([...Array(count).keys()]);
  }
  return geometry;
}

/** Mirrors a geometry across the YZ plane (left part → right part). */
function mirrored(geometry) {
  const copy = geometry.clone();
  copy.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  // A negative scale inverts winding; restore it. Normals were transformed
  // correctly by applyMatrix4.
  const index = copy.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    index.setX(i, index.getX(i + 2));
    index.setX(i + 2, a);
  }
  return copy;
}

const translate = (geometry, x, y, z) => geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));

// ---------------------------------------------------------------------------
// Fuselage
// ---------------------------------------------------------------------------

// Station table: t (0 nose → 1 tail), half-width, half-height, centre offset.
const STATIONS = [
  [0.0, 0.012, 0.012, -0.26],
  [0.008, 0.15, 0.135, -0.25],
  [0.025, 0.37, 0.335, -0.215],
  [0.055, 0.64, 0.6, -0.15],
  [0.095, 0.875, 0.87, -0.08],
  [0.145, 1.04, 1.07, -0.025],
  [0.2, 1.12, 1.15, 0.0],
  [0.26, 1.15, 1.17, 0.0],
  [0.6, 1.15, 1.17, 0.0],
  [0.69, 1.11, 1.13, 0.035],
  [0.77, 0.99, 1.01, 0.115],
  [0.85, 0.77, 0.79, 0.265],
  [0.925, 0.46, 0.48, 0.45],
  [0.975, 0.21, 0.23, 0.575],
  [1.0, 0.035, 0.04, 0.63],
];
const stT = STATIONS.map((s) => s[0]);
const halfWidth = monotoneCubic(stT, STATIONS.map((s) => s[1]));
const halfHeight = monotoneCubic(stT, STATIONS.map((s) => s[2]));
const centreOffset = monotoneCubic(stT, STATIONS.map((s) => s[3]));

/** Point on the fuselage skin. theta = 0 is the top, +90° is the left side. */
function skin(t, theta, target = new THREE.Vector3()) {
  return target.set(
    halfWidth(t) * Math.sin(theta),
    CENTER_Y + centreOffset(t) + halfHeight(t) * Math.cos(theta),
    zAt(t),
  );
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Outward unit normal of the fuselage skin, from finite differences. */
function skinNormal(t, theta, target = new THREE.Vector3()) {
  const et = 1e-3;
  const eh = 1e-3;
  const t0 = clamp(t - et, 0, 1);
  const t1 = clamp(t + et, 0, 1);
  skin(t1, theta, _a).sub(skin(t0, theta, _b));
  skin(t, theta + eh, _c).sub(skin(t, theta - eh, _d));
  target.crossVectors(_c, _a).normalize();
  // Point away from the centreline.
  const radialX = Math.sin(theta);
  const radialY = Math.cos(theta);
  if (target.x * radialX + target.y * radialY < 0) target.negate();
  return target;
}

/** Longitudinal sample positions, denser toward the nose and tail. */
function fuselageSamples(count, from = 0, to = 1) {
  const out = [];
  for (let i = 0; i <= count; i++) {
    const u = i / count;
    const eased = 0.55 * u + 0.45 * (0.5 - 0.5 * Math.cos(Math.PI * u));
    out.push(lerp(from, to, eased));
  }
  return out;
}

/**
 * A patch of fuselage skin. `thetaRange(t)` gives the angular extent at each
 * station; `offset` lifts the patch off the skin (for glass and windows).
 */
function skinPatch(tSamples, thetaRange, thetaSegments, offset = 0) {
  const positions = [];
  const normals = [];
  const indices = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const cols = thetaSegments + 1;
  tSamples.forEach((t) => {
    const [from, to] = thetaRange(t);
    for (let j = 0; j <= thetaSegments; j++) {
      const theta = lerp(from, to, j / thetaSegments);
      skin(t, theta, p);
      skinNormal(t, theta, n);
      p.addScaledVector(n, offset);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  });
  for (let i = 0; i < tSamples.length - 1; i++) {
    for (let j = 0; j < thetaSegments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return windToNormals(geometryFrom(positions, indices, normals));
}

/**
 * Angle from the top at which pearl paint gives way to graphite. The line
 * starts under the nose, runs low along the cabin and sweeps up at the tail.
 */
function paintLine(t) {
  const nose = lerp(180, 116, smoothstep(0.015, 0.14, t));
  const tail = lerp(0, 34, smoothstep(0.6, 1, t));
  return (nose - tail) * DEG;
}

function buildFuselage() {
  const samples = fuselageSamples(72);
  const upper = skinPatch(samples, (t) => [-paintLine(t), paintLine(t)], 30);
  const lower = skinPatch(samples, (t) => [paintLine(t), 2 * Math.PI - paintLine(t)], 18);

  // Tail cap (APU exhaust).
  const cap = new THREE.CircleGeometry(1, 16);
  cap.applyMatrix4(new THREE.Matrix4().makeScale(halfWidth(1), halfHeight(1), 1));
  cap.rotateY(Math.PI);
  translate(cap, 0, CENTER_Y + centreOffset(1), zAt(1));

  return { upper, lower, cap: clean(cap) };
}

/** Wraparound cockpit visor: one dark band, pointed at both ends. */
function buildCockpitGlass() {
  const from = 0.064;
  const to = 0.152;
  const samples = [];
  const count = 22;
  for (let i = 0; i <= count; i++) samples.push(lerp(from, to, i / count));
  const halfAngle = (t) => {
    const u = (t - from) / (to - from);
    // Opens quickly behind the nose, closes in a long sweep toward the cabin.
    const shape = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.62);
    return Math.max(0.5, 79 * shape) * DEG;
  };
  return skinPatch(samples, (t) => [-halfAngle(t), halfAngle(t)], 22, 0.012);
}

/** Oval cabin windows along both sides. */
function buildCabinWindows() {
  const parts = [];
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const windows = 8;
  for (const side of [1, -1]) {
    for (let w = 0; w < windows; w++) {
      const tc = lerp(0.245, 0.565, w / (windows - 1));
      const thetaC = side * 71 * DEG;
      const positions = [];
      const normals = [];
      const indices = [];
      skin(tc, thetaC, p);
      skinNormal(tc, thetaC, n);
      p.addScaledVector(n, 0.012);
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      const ring = 20;
      for (let k = 0; k < ring; k++) {
        const a = (k / ring) * Math.PI * 2;
        const t = tc + 0.0082 * Math.cos(a);
        const theta = thetaC + 9.2 * DEG * Math.sin(a);
        skin(t, theta, p);
        skinNormal(t, theta, n);
        p.addScaledVector(n, 0.012);
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
      }
      for (let k = 0; k < ring; k++) indices.push(0, 1 + k, 1 + ((k + 1) % ring));
      parts.push(windToNormals(geometryFrom(positions, indices, normals)));
    }
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Lifting surfaces
// ---------------------------------------------------------------------------

/** NACA 4-digit style section: half-thickness at chord fraction x. */
function sectionThickness(x, ratio) {
  return (
    5 * ratio * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4)
  );
}

/**
 * Lofts an aerofoil through a list of stations.
 * station: { le: Vector3, chord, thickness, up: Vector3, camber? }
 * `le` is the leading-edge point, the chord runs toward -Z, `up` is the
 * direction of section thickness.
 */
function loftSurface(stations, { capEnd = true, capStart = false, loopHalf = 14 } = {}) {
  const positions = [];
  const indices = [];
  const loop = 2 * loopHalf + 1;
  const aft = new THREE.Vector3(0, 0, -1);
  const p = new THREE.Vector3();

  for (const st of stations) {
    const camber = st.camber ?? 0;
    for (let k = 0; k < loop; k++) {
      const upperSide = k <= loopHalf;
      const u = upperSide ? k / loopHalf : (k - loopHalf) / loopHalf;
      const x = upperSide ? 0.5 * (1 + Math.cos(Math.PI * u)) : 0.5 * (1 - Math.cos(Math.PI * u));
      const yt = sectionThickness(x, st.thickness);
      const yc = camber * 4 * x * (1 - x);
      const y = yc + (upperSide ? yt : -yt);
      p.copy(st.le).addScaledVector(aft, x * st.chord).addScaledVector(st.up, y * st.chord);
      positions.push(p.x, p.y, p.z);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) {
    for (let k = 0; k < loop - 1; k++) {
      const a = s * loop + k;
      const b = a + 1;
      const c = a + loop;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const addCap = (stationIndex) => {
    const base = stationIndex * loop;
    // Fan across the section between matching upper and lower points.
    for (let k = 0; k < loopHalf; k++) {
      const upperA = base + k;
      const upperB = base + k + 1;
      const lowerA = base + (loop - 1 - k);
      const lowerB = base + (loop - 2 - k);
      // Duplicate vertices so the cap gets its own flat normals.
      const start = positions.length / 3;
      for (const idx of [upperA, upperB, lowerA, lowerB]) {
        positions.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
      }
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  };
  if (capEnd) addCap(stations.length - 1);
  if (capStart) addCap(0);

  const geometry = geometryFrom(positions, indices);
  // Orient using the first station: upper-surface normals follow `up`.
  const centre = new THREE.Vector3();
  const pos = geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) centre.add(p.fromBufferAttribute(pos, i));
  centre.divideScalar(pos.count);
  // Outward = away from the local chord plane, approximated per vertex by the
  // nearest station's `up` signed by which side of the surface the vertex is on.
  const nor = geometry.getAttribute("normal");
  const n = new THREE.Vector3();
  let agree = 0;
  for (let s = 0; s < stations.length; s++) {
    const st = stations[s];
    // Sample mid-chord points of the upper and lower surface.
    const upperIdx = s * loop + Math.round(loopHalf * 0.5);
    const lowerIdx = s * loop + Math.round(loopHalf * 1.5);
    agree += n.fromBufferAttribute(nor, upperIdx).dot(st.up);
    agree -= n.fromBufferAttribute(nor, lowerIdx).dot(st.up);
  }
  if (agree < 0) flip(geometry);
  return geometry;
}

const upFromCant = (cantDeg) => new THREE.Vector3(-Math.sin(cantDeg * DEG), Math.cos(cantDeg * DEG), 0);

function buildWingLeft() {
  // x outboard, y up, z of leading edge, chord, thickness ratio, cant angle
  const table = [
    [0.55, 1.03, 2.62, 4.72, 0.13, 3.5],
    [1.35, 1.07, 2.2, 4.3, 0.125, 3.5],
    [2.3, 1.12, 1.66, 3.82, 0.12, 3.5],
    [4.0, 1.22, 0.7, 3.12, 0.112, 3.5],
    [6.0, 1.34, -0.44, 2.36, 0.104, 3.5],
    [8.0, 1.47, -1.58, 1.74, 0.097, 3.5],
    [9.3, 1.55, -2.32, 1.38, 0.092, 6],
    [9.72, 1.6, -2.58, 1.24, 0.09, 20],
    [10.02, 1.74, -2.84, 1.1, 0.09, 42],
    [10.2, 2.0, -3.12, 0.96, 0.09, 62],
    [10.31, 2.42, -3.5, 0.78, 0.09, 74],
    [10.39, 2.92, -3.92, 0.58, 0.09, 80],
    [10.43, 3.26, -4.2, 0.4, 0.09, 82],
  ];
  const stations = table.map(([x, y, z, chord, thickness, cant]) => ({
    le: new THREE.Vector3(x, y, z),
    chord,
    thickness,
    up: upFromCant(cant),
    camber: 0.018,
  }));
  return loftSurface(stations);
}

function buildFin() {
  const up = new THREE.Vector3(1, 0, 0);
  const table = [
    [2.2, -5.3, 4.5, 0.1],
    [3.1, -6.05, 3.95, 0.1],
    [4.6, -7.35, 3.22, 0.098],
    [6.28, -8.82, 2.4, 0.095],
  ];
  const stations = table.map(([y, z, chord, thickness]) => ({
    le: new THREE.Vector3(0, y, z),
    chord,
    thickness,
    up,
  }));
  return loftSurface(stations);
}

function buildStabiliserLeft() {
  const up = new THREE.Vector3(0, 1, 0);
  const table = [
    [0.0, 6.2, -8.62, 2.3, 0.09],
    [1.6, 6.23, -9.46, 1.72, 0.088],
    [3.2, 6.26, -10.3, 1.16, 0.085],
    [3.85, 6.27, -10.64, 0.9, 0.085],
  ];
  const stations = table.map(([x, y, z, chord, thickness]) => ({
    le: new THREE.Vector3(x, y, z),
    chord,
    thickness,
    up,
  }));
  return loftSurface(stations);
}

/** Bullet fairing where the stabiliser meets the fin. */
function buildTailBullet() {
  const geometry = new THREE.SphereGeometry(1, 20, 14);
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(0.2, 0.2, 1.75));
  translate(geometry, 0, 6.24, -9.75);
  return clean(geometry);
}

/** Wing-to-body fairing; also hides the retracted main gear. */
function buildBellyFairing() {
  const geometry = new THREE.SphereGeometry(1, 28, 16);
  geometry.applyMatrix4(new THREE.Matrix4().makeScale(1.44, 0.56, 4.3));
  translate(geometry, 0, 0.98, 0.25);
  return clean(geometry);
}

// ---------------------------------------------------------------------------
// Engines
// ---------------------------------------------------------------------------

const ENGINE = { x: 2.08, y: 2.56, zFront: -3.55, length: 3.9 };

/** Lathe around the Z axis from [axialFraction, radius] pairs. */
function lathe(profile, segments = 40) {
  const points = profile.map(([s, r]) => new THREE.Vector2(r, -s * ENGINE.length));
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.rotateX(Math.PI / 2);
  // After the rotation the profile axis runs along +Z with y → z.
  return clean(geometry);
}

function buildEngineLeft() {
  const axis = (p) => new THREE.Vector3(p.x, p.y, 0).normalize();
  const inward = (p) => axis(p).negate();

  const cowl = orient(
    lathe([
      [0.045, 0.578],
      [0.1, 0.626],
      [0.2, 0.655],
      [0.34, 0.665],
      [0.52, 0.655],
      [0.68, 0.622],
      [0.8, 0.57],
      [0.875, 0.515],
    ]),
    axis,
  );
  const lip = orient(
    lathe(
      [
        [0.06, 0.462],
        [0.025, 0.468],
        [0.006, 0.486],
        [0.0, 0.512],
        [0.008, 0.538],
        [0.025, 0.562],
        [0.045, 0.578],
      ],
      40,
    ),
    (p) => axis(p).multiplyScalar(p.length() > 0.512 ? 1 : -1).add(new THREE.Vector3(0, 0, 0.6)),
  );
  const duct = orient(
    lathe([
      [0.06, 0.462],
      [0.14, 0.468],
      [0.3, 0.478],
    ]),
    inward,
  );
  const nozzle = orient(
    lathe([
      [0.875, 0.515],
      [0.94, 0.455],
      [1.0, 0.405],
    ]),
    axis,
  );
  const nozzleInner = orient(
    lathe([
      [1.0, 0.405],
      [0.985, 0.385],
      [0.9, 0.37],
      [0.78, 0.36],
    ]),
    inward,
  );
  // Core plug visible in the exhaust.
  const plug = orient(
    lathe([
      [0.78, 0.36],
      [0.8, 0.2],
      [0.9, 0.17],
      [1.0, 0.1],
      [1.06, 0.012],
    ]),
    axis,
  );

  const place = (g) => translate(g, ENGINE.x, ENGINE.y, ENGINE.zFront);
  for (const g of [cowl, lip, duct, nozzle, nozzleInner, plug]) place(g);

  // Pylon between fuselage and nacelle.
  const up = new THREE.Vector3(0, 1, 0);
  const pylon = loftSurface(
    [
      { le: new THREE.Vector3(0.72, 2.34, -4.05), chord: 3.05, thickness: 0.11, up },
      { le: new THREE.Vector3(1.2, 2.46, -4.2), chord: 2.75, thickness: 0.1, up },
      { le: new THREE.Vector3(1.72, 2.55, -4.35), chord: 2.5, thickness: 0.1, up },
    ],
    { capEnd: false },
  );

  return { cowl, lip, duct, nozzle, nozzleInner, plug, pylon };
}

/** Fan and spinner, centred on the origin so the node can spin about Z. */
function buildFan() {
  const parts = [];
  const blades = 22;
  const hub = 0.165;
  const tip = 0.462;
  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2;
    const positions = [];
    const indices = [];
    const rows = 5;
    for (let r = 0; r <= rows; r++) {
      const radius = lerp(hub, tip, r / rows);
      // Blades twist and widen toward the tip.
      const twist = lerp(62, 28, r / rows) * DEG;
      const half = lerp(0.045, 0.085, r / rows);
      for (const side of [-1, 1]) {
        const local = new THREE.Vector3(side * half * Math.cos(twist), radius, side * half * Math.sin(twist));
        local.applyAxisAngle(new THREE.Vector3(0, 0, 1), angle);
        positions.push(local.x, local.y, local.z);
      }
    }
    for (let r = 0; r < rows; r++) {
      const a = r * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      // Back faces so blades are visible from both sides.
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    parts.push(geometryFrom(positions, indices));
  }
  const blade = mergeGeometries(parts);

  const spinner = new THREE.ConeGeometry(hub + 0.01, 0.42, 24, 6, true);
  spinner.rotateX(Math.PI / 2);
  translate(spinner, 0, 0, 0.15);
  // Disc behind the blades so the duct does not look hollow.
  const backing = new THREE.CircleGeometry(0.478, 32);
  translate(backing, 0, 0, -0.09);
  return { blade, spinner: clean(spinner), backing: clean(backing) };
}

// ---------------------------------------------------------------------------
// Landing gear (built around its hinge so the node can rotate to retract)
// ---------------------------------------------------------------------------

function cylinderBetween(a, b, radius, segments = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const geometry = new THREE.CylinderGeometry(radius, radius, dir.length(), segments, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  geometry.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  translate(geometry, mid.x, mid.y, mid.z);
  return clean(geometry);
}

/** A flat panel, given by its centre and size. */
function plate(cx, cy, cz, sx, sy, sz) {
  const geometry = new THREE.BoxGeometry(sx, sy, sz);
  translate(geometry, cx, cy, cz);
  return clean(geometry);
}

/**
 * A tyre on its wheel, turning about the X axis. The tyre is lathed from a
 * rounded section (tread, shoulders, sidewalls) rather than a torus, so it
 * has the squat look of an aircraft tyre.
 */
function wheel(x, y, z, radius, width) {
  const half = width / 2;
  const rim = radius * 0.56;
  const wall = radius - rim;
  // [along the axle, distance from it], shoulder to shoulder.
  const section = [
    [-half * 0.8, rim],
    [-half, rim + wall * 0.38],
    [-half, rim + wall * 0.72],
    [-half * 0.8, radius - wall * 0.1],
    [-half * 0.42, radius],
    [half * 0.42, radius],
    [half * 0.8, radius - wall * 0.1],
    [half, rim + wall * 0.72],
    [half, rim + wall * 0.38],
    [half * 0.8, rim],
  ];
  const fromAxle = (p) => new THREE.Vector3(0, p.y, p.z).normalize();
  const tyre = new THREE.LatheGeometry(
    section.map(([along, out]) => new THREE.Vector2(out, along)),
    30,
  );
  tyre.rotateZ(-Math.PI / 2);
  orient(tyre, fromAxle);
  translate(tyre, x, y, z);

  // Wheel: a dished disc on each side, with a hub cap.
  const disc = new THREE.LatheGeometry(
    [
      [-half * 0.86, rim * 1.02],
      [-half * 0.62, rim * 0.8],
      [-half * 0.7, rim * 0.34],
      [-half * 0.92, rim * 0.3],
      [-half * 0.94, 0.004],
    ].map(([along, out]) => new THREE.Vector2(out, along)),
    22,
  );
  disc.rotateZ(-Math.PI / 2);
  orient(disc, () => new THREE.Vector3(-1, 0, 0));
  clean(disc);
  const discs = mergeGeometries([disc, mirrored(disc)]);
  translate(discs, x, y, z);
  return { tyre: clean(tyre), hub: discs };
}

/**
 * Hinge positions are in aircraft coordinates with the airframe on its gear.
 * `drop` is the distance from the hinge down to the axle; the wheels touch
 * the ground at y = 0.
 */
const GEAR_NOSE_DROP = 1.27;

const GEAR = {
  nose: { hinge: [0, 1.55, 8.3], drop: GEAR_NOSE_DROP, radius: 0.28, width: 0.17, track: 0.37 },
  // The main gear is a trailing-link leg: the axle sits behind the hinge.
  main: { hinge: [2.05, 1.5, 0.34], drop: 1.07, radius: 0.43, width: 0.26, track: 0.52, trail: 0.34 },
};

/**
 * Nose gear drag brace. It is two links: the upper hangs from the airframe
 * ahead of the leg, the lower is pinned to the front of the leg, and they meet
 * at a knee. Locked straight with the gear down; as the leg swings forward
 * the knee folds up into the bay. The runtime positions both links (see
 * noseBracePose in src/flight/aircraft.ts, which mirrors these numbers).
 */
const NOSE_BRACE = {
  /** Where the upper link hangs from the airframe. */
  anchor: [0, 1.62, 9.25],
  /** Where the lower link is pinned to the leg, relative to the leg's hinge. */
  onLeg: [0, -GEAR_NOSE_DROP * 0.36, 0.07],
  radius: 0.042,
};

/** Length of each brace link: half the anchor-to-leg distance, gear down. */
function noseBraceLink() {
  const [, hy, hz] = GEAR.nose.hinge;
  const dy = NOSE_BRACE.anchor[1] - (hy + NOSE_BRACE.onLeg[1]);
  const dz = NOSE_BRACE.anchor[2] - (hz + NOSE_BRACE.onLeg[2]);
  return Math.hypot(dy, dz) / 2;
}

/** One brace link, hanging from its pin along -Y, with lugs at both ends. */
function buildBraceLink(length) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  return mergeGeometries([
    cylinderBetween(v(0, 0, 0), v(0, -length, 0), NOSE_BRACE.radius, 10),
    cylinderBetween(v(-0.07, 0, 0), v(0.07, 0, 0), 0.05, 10),
    cylinderBetween(v(-0.07, -length, 0), v(0.07, -length, 0), 0.05, 10),
  ]);
}

/** Nose gear: oleo strut, torque links, steering collar and twin wheels. */
function buildNoseGear() {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const { drop, radius, width, track } = GEAR.nose;
  const painted = [
    // Trunnion across the hinge, outer cylinder, steering collar at its foot.
    cylinderBetween(v(-0.2, 0, 0), v(0.2, 0, 0), 0.06, 12),
    cylinderBetween(v(0, 0.12, 0), v(0, -drop * 0.5, 0), 0.098, 16),
    cylinderBetween(v(0, -drop * 0.44, 0), v(0, -drop * 0.53, 0), 0.124, 16),
    // Lug on the front of the leg where the drag brace is pinned.
    cylinderBetween(v(-0.07, NOSE_BRACE.onLeg[1], NOSE_BRACE.onLeg[2]), v(0.07, NOSE_BRACE.onLeg[1], NOSE_BRACE.onLeg[2]), 0.05, 10),
    cylinderBetween(v(0, NOSE_BRACE.onLeg[1] + 0.08, 0.02), v(0, NOSE_BRACE.onLeg[1], NOSE_BRACE.onLeg[2]), 0.035, 8),
    // Torque links (scissors) ahead of the strut.
    cylinderBetween(v(0, -drop * 0.5, 0.06), v(0, -drop * 0.7, 0.21), 0.024, 8),
    cylinderBetween(v(0, -drop * 0.7, 0.21), v(0, -drop * 0.93, 0.05), 0.024, 8),
    cylinderBetween(v(-0.05, -drop * 0.7, 0.21), v(0.05, -drop * 0.7, 0.21), 0.03, 8),
    // Axle and its fork.
    cylinderBetween(v(-track / 2 - 0.03, -drop, 0), v(track / 2 + 0.03, -drop, 0), 0.04, 10),
    cylinderBetween(v(0, -drop * 0.9, 0), v(0, -drop - 0.03, 0), 0.062, 12),
    // Taxi light housings on the strut.
    cylinderBetween(v(-0.12, -drop * 0.3, 0.02), v(-0.12, -drop * 0.3, 0.1), 0.045, 10),
    cylinderBetween(v(0.12, -drop * 0.3, 0.02), v(0.12, -drop * 0.3, 0.1), 0.045, 10),
    cylinderBetween(v(-0.12, -drop * 0.3, 0.05), v(0.12, -drop * 0.3, 0.05), 0.018, 6),
  ];
  // Chromed piston showing below the outer cylinder.
  const polished = [cylinderBetween(v(0, -drop * 0.5, 0), v(0, -drop * 0.92, 0), 0.066, 14)];
  const tyres = [];
  for (const side of [-1, 1]) {
    const w = wheel((side * track) / 2, -drop, 0, radius, width);
    tyres.push(w.tyre);
    polished.push(w.hub);
  }
  return {
    metal: mergeGeometries(painted),
    polished: mergeGeometries(polished),
    tyre: mergeGeometries(tyres),
  };
}

/**
 * Left main gear: a trailing-link leg. The post hangs from the wing, a
 * trailing arm carries the axle behind it, and the shock strut bridges the
 * two. A door panel on the outboard side closes the wheel well when the leg
 * swings inward.
 */
function buildMainGearLeft() {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const { drop, radius, width, track, trail } = GEAR.main;
  const knee = v(0, -drop * 0.66, 0.02);
  const axle = v(0, -drop, -trail);
  const armMid = new THREE.Vector3().lerpVectors(knee, axle, 0.62);
  const painted = [
    // Post, with its trunnion across the hinge line.
    cylinderBetween(v(0, 0.1, 0), knee, 0.092, 16),
    cylinderBetween(v(0, 0, -0.22), v(0, 0, 0.22), 0.06, 10),
    // Trailing arm and the knuckle it pivots on.
    cylinderBetween(knee, axle, 0.068, 12),
    cylinderBetween(v(-0.11, knee.y, knee.z), v(0.11, knee.y, knee.z), 0.075, 12),
    // Shock strut body.
    cylinderBetween(v(0, -drop * 0.14, -0.15), v(0, -drop * 0.52, -0.2), 0.062, 12),
    // Side stay, folding inboard toward the fuselage.
    cylinderBetween(v(0, -drop * 0.4, 0), v(-0.86, 0.05, 0), 0.04, 10),
    cylinderBetween(v(0, -drop * 0.22, 0.03), v(-0.46, 0.06, 0.03), 0.024, 8),
    // Axle.
    cylinderBetween(v(-track / 2 - 0.04, -drop, -trail), v(track / 2 + 0.04, -drop, -trail), 0.052, 12),
    // Brake line down the post.
    cylinderBetween(v(0.07, -0.05, 0.07), v(0.07, knee.y, 0.08), 0.012, 6),
  ];
  const polished = [cylinderBetween(v(0, -drop * 0.5, -0.197), armMid, 0.044, 12)];
  const tyres = [];
  for (const side of [-1, 1]) {
    const w = wheel((side * track) / 2, -drop, -trail, radius, width);
    tyres.push(w.tyre);
    polished.push(w.hub);
  }
  // Leg door on the outboard side, with the two brackets that carry it.
  const door = mergeGeometries([
    plate(0.2, -drop * 0.4, -0.1, 0.022, drop * 0.72, 0.74),
    cylinderBetween(v(0, -drop * 0.12, 0), v(0.2, -drop * 0.12, 0), 0.016, 6),
    cylinderBetween(v(0, -drop * 0.56, 0), v(0.2, -drop * 0.56, 0), 0.016, 6),
  ]);
  return {
    metal: mergeGeometries(painted),
    polished: mergeGeometries(polished),
    tyre: mergeGeometries(tyres),
    door,
  };
}

/**
 * Nose gear bay doors. Each is hinged along the edge of the bay and hangs
 * open while the gear is down. Built closed, around the hinge line, for the
 * left (+X) door: the panel reaches from the hinge toward the centreline.
 */
const NOSE_DOOR = { halfBay: 0.24, length: 1.5, y: 1.6, z: 9.02, slope: 10.5 * DEG };

function buildNoseDoorLeft() {
  return plate(-NOSE_DOOR.halfBay / 2, 0, 0, NOSE_DOOR.halfBay, 0.02, NOSE_DOOR.length);
}

// ---------------------------------------------------------------------------
// Lights
// ---------------------------------------------------------------------------

const LIGHTS = {
  Light_Nav_L: [9.74, 1.615, -2.52],
  Light_Nav_R: [-9.74, 1.615, -2.52],
  Light_Tail: [0, 6.24, -11.52],
  Light_Beacon_Top: [0, CENTER_Y + centreOffset(0.4) + halfHeight(0.4) + 0.035, zAt(0.4)],
  Light_Beacon_Bottom: [0, 0.455, 0.6],
  Light_Landing_L: [1.5, 1.09, 2.28],
  Light_Landing_R: [-1.5, 1.09, 2.28],
};

function lamp(position, radius) {
  const geometry = new THREE.SphereGeometry(radius, 10, 8);
  translate(geometry, ...position);
  return clean(geometry);
}

// ---------------------------------------------------------------------------
// Assemble the glTF document
// ---------------------------------------------------------------------------

function addPrimitive(doc, buffer, mesh, geometry, material) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  const indexArray =
    position.count > 65535 ? new Uint32Array(index.array) : new Uint16Array(index.array);
  const primitive = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc.createAccessor().setType("VEC3").setArray(new Float32Array(position.array)).setBuffer(buffer),
    )
    .setAttribute(
      "NORMAL",
      doc.createAccessor().setType("VEC3").setArray(new Float32Array(normal.array)).setBuffer(buffer),
    )
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(indexArray).setBuffer(buffer))
    .setMaterial(material);
  mesh.addPrimitive(primitive);
  return position.count;
}

async function main() {
  const doc = new Document();
  doc.getRoot().getAsset().generator = "career-flight/scripts/build-aircraft.mjs";
  const buffer = doc.createBuffer();
  const scene = doc.createScene("SR-01");
  const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
  const emissiveStrength = doc.createExtension(KHRMaterialsEmissiveStrength);

  const material = (name, color, metallic, roughness, coat) => {
    const m = doc
      .createMaterial(name)
      .setBaseColorFactor([...color, 1])
      .setMetallicFactor(metallic)
      .setRoughnessFactor(roughness);
    if (coat) {
      m.setExtension(
        "KHR_materials_clearcoat",
        clearcoat.createClearcoat().setClearcoatFactor(coat[0]).setClearcoatRoughnessFactor(coat[1]),
      );
    }
    return m;
  };
  const emissive = (name, color, strength) =>
    doc
      .createMaterial(name)
      .setBaseColorFactor([0.02, 0.02, 0.02, 1])
      .setEmissiveFactor(color)
      .setRoughnessFactor(0.4)
      .setExtension(
        "KHR_materials_emissive_strength",
        emissiveStrength.createEmissiveStrength().setEmissiveStrength(strength),
      );

  const M = {
    pearl: material("Paint_Pearl", [0.9, 0.9, 0.885], 0.1, 0.34, [1, 0.07]),
    graphite: material("Paint_Graphite", [0.075, 0.082, 0.095], 0.55, 0.36, [0.7, 0.12]),
    glass: material("Glass_Dark", [0.012, 0.016, 0.024], 0.85, 0.06),
    polished: material("Metal_Polished", [0.78, 0.79, 0.81], 1, 0.16),
    darkMetal: material("Metal_Dark", [0.05, 0.052, 0.058], 0.8, 0.48),
    fan: material("Metal_Fan", [0.3, 0.31, 0.33], 1, 0.36).setDoubleSided(true),
    gearMetal: material("Gear_Metal", [0.74, 0.75, 0.76], 0.35, 0.42),
    tyre: material("Rubber_Tyre", [0.022, 0.022, 0.024], 0, 0.88),
    bay: material("Bay_Dark", [0.018, 0.019, 0.021], 0.2, 0.9),
    lightNav: emissive("Light_Nav", [0.45, 0.72, 1], 6),
    lightBeacon: emissive("Light_Beacon", [1, 0.2, 0.14], 6),
    lightLanding: emissive("Light_Landing", [1, 0.96, 0.86], 8),
  };

  const root = doc.createNode("SR01");
  scene.addChild(root);
  // Everything except the landing gear hangs from this node, which lifts the
  // airframe onto its gear.
  const body = doc.createNode("Body").setTranslation([0, BODY_LIFT, 0]);
  root.addChild(body);
  let vertexTotal = 0;
  let triangleTotal = 0;

  /** Adds a node holding one mesh made of [geometry, material] pairs. */
  const addMeshNode = (name, parts, parent = body, translation) => {
    const mesh = doc.createMesh(name);
    for (const [geometry, mat] of parts) {
      clean(geometry);
      vertexTotal += addPrimitive(doc, buffer, mesh, geometry, mat);
      triangleTotal += geometry.getIndex().count / 3;
    }
    // The named node carries no mesh: it is the part's pivot. Mesh
    // quantization (below) folds a dequantizing offset and scale into the
    // transform of whichever node holds the mesh, which would move a moving
    // part's pivot off its hinge. Keeping the mesh on a child node leaves the
    // pivot where it was placed.
    const node = doc.createNode(name);
    node.addChild(doc.createNode(`${name}_Mesh`).setMesh(mesh));
    if (translation) node.setTranslation(translation);
    parent.addChild(node);
    return node;
  };

  // ---- Airframe -----------------------------------------------------------
  const fuselage = buildFuselage();
  const wingL = buildWingLeft();
  const stabL = buildStabiliserLeft();
  const engineL = buildEngineLeft();
  const mirrorAll = (obj) => Object.fromEntries(Object.entries(obj).map(([k, g]) => [k, mirrored(g)]));
  const engineR = mirrorAll(engineL);

  const pearl = mergeGeometries([
    fuselage.upper,
    wingL,
    mirrored(wingL),
    buildFin(),
    stabL,
    mirrored(stabL),
    buildTailBullet(),
    engineL.cowl,
    engineR.cowl,
    engineL.pylon,
    engineR.pylon,
  ]);
  const graphite = mergeGeometries([fuselage.lower, buildBellyFairing()]);
  const glass = mergeGeometries([buildCockpitGlass(), buildCabinWindows()]);
  const polished = mergeGeometries([engineL.lip, engineR.lip]);
  const dark = mergeGeometries([
    fuselage.cap,
    engineL.duct,
    engineR.duct,
    engineL.nozzle,
    engineR.nozzle,
    engineL.nozzleInner,
    engineR.nozzleInner,
    engineL.plug,
    engineR.plug,
  ]);

  addMeshNode("Airframe", [
    [pearl, M.pearl],
    [graphite, M.graphite],
    [glass, M.glass],
    [polished, M.polished],
    [dark, M.darkMetal],
  ]);

  // ---- Fans ---------------------------------------------------------------
  const fan = buildFan();
  const fanZ = ENGINE.zFront - 0.27 * ENGINE.length;
  for (const [name, side] of [
    ["Fan_L", 1],
    ["Fan_R", -1],
  ]) {
    addMeshNode(
      name,
      [
        [fan.blade.clone(), M.fan],
        [mergeGeometries([fan.spinner.clone(), fan.backing.clone()]), M.darkMetal],
      ],
      body,
      [side * ENGINE.x, ENGINE.y, fanZ],
    );
  }

  // ---- Landing gear -------------------------------------------------------
  const gearNode = (name, built, hinge, withDoor) => {
    const parts = [
      [built.metal, M.gearMetal],
      [built.polished, M.polished],
      [built.tyre, M.tyre],
    ];
    if (withDoor) parts.push([built.door, M.pearl]);
    return addMeshNode(name, parts, root, hinge);
  };
  gearNode("Gear_Nose", buildNoseGear(), GEAR.nose.hinge, false);
  const mainL = buildMainGearLeft();
  const [mx, my, mz] = GEAR.main.hinge;
  gearNode("Gear_Main_L", mainL, [mx, my, mz], true);
  gearNode("Gear_Main_R", mirrorAll(mainL), [-mx, my, mz], true);

  // Nose bay doors: the node sits on the hinge line, tilted to follow the
  // underside of the nose; the runtime swings it about its own Z axis.
  const doorL = buildNoseDoorLeft();
  const doorTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -NOSE_DOOR.slope);
  for (const [name, side, geometry] of [
    ["Door_Nose_L", 1, doorL],
    ["Door_Nose_R", -1, mirrored(doorL)],
  ]) {
    addMeshNode(name, [[geometry, M.graphite]], root, [
      side * NOSE_DOOR.halfBay,
      NOSE_DOOR.y,
      NOSE_DOOR.z,
    ]).setRotation(doorTilt.toArray());
  }
  // The open bay between the doors: a dark well, shown only while they are open.
  addMeshNode(
    "Bay_Nose",
    [[plate(0, 0, 0, NOSE_DOOR.halfBay * 2, 0.012, NOSE_DOOR.length), M.bay]],
    root,
    [0, NOSE_DOOR.y - 0.045, NOSE_DOOR.z],
  ).setRotation(doorTilt.toArray());

  // Drag brace links, placed by the runtime.
  const link = noseBraceLink();
  addMeshNode("Brace_Nose_Upper", [[buildBraceLink(link), M.gearMetal]], root, NOSE_BRACE.anchor);
  addMeshNode("Brace_Nose_Lower", [[buildBraceLink(link), M.gearMetal]], root, [
    0,
    GEAR.nose.hinge[1] + NOSE_BRACE.onLeg[1],
    GEAR.nose.hinge[2] + NOSE_BRACE.onLeg[2],
  ]);

  // ---- Lights -------------------------------------------------------------
  addMeshNode("Lights_Nav", [
    [
      mergeGeometries([
        lamp(LIGHTS.Light_Nav_L, 0.055),
        lamp(LIGHTS.Light_Nav_R, 0.055),
        lamp(LIGHTS.Light_Tail, 0.05),
      ]),
      M.lightNav,
    ],
  ]);
  addMeshNode("Lights_Beacon", [
    [
      mergeGeometries([lamp(LIGHTS.Light_Beacon_Top, 0.06), lamp(LIGHTS.Light_Beacon_Bottom, 0.06)]),
      M.lightBeacon,
    ],
  ]);
  addMeshNode("Lights_Landing", [
    [
      mergeGeometries([lamp(LIGHTS.Light_Landing_L, 0.075), lamp(LIGHTS.Light_Landing_R, 0.075)]),
      M.lightLanding,
    ],
  ]);
  // Empty anchors for runtime glow sprites.
  for (const [name, position] of Object.entries(LIGHTS)) {
    body.addChild(doc.createNode(name).setTranslation(position));
  }

  // ---- Marking anchors (the SR-01 decal is drawn at runtime) ---------------
  body.addChild(doc.createNode("Decal_SR01_L").setTranslation([0.168, 4.42, -8.5]));
  body.addChild(doc.createNode("Decal_SR01_R").setTranslation([-0.168, 4.42, -8.5]));

  // ---- Optimise and write -------------------------------------------------
  await MeshoptEncoder.ready;
  await doc.transform(
    dedup(),
    // keepLeaves: the light and decal anchors are intentionally empty nodes.
    prune({ keepLeaves: true }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );

  const io = new NodeIO()
    .registerExtensions([
      KHRMaterialsClearcoat,
      KHRMaterialsEmissiveStrength,
      KHRMeshQuantization,
      EXTMeshoptCompression,
    ])
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  await io.write(OUT_FILE, doc);

  const bytes = statSync(OUT_FILE).size;
  console.log(`Wrote ${OUT_FILE}`);
  console.log(`  vertices:  ${vertexTotal.toLocaleString("en-US")}`);
  console.log(`  triangles: ${Math.round(triangleTotal).toLocaleString("en-US")}`);
  console.log(`  size:      ${(bytes / 1024).toFixed(1)} KB`);
  console.log(`  centreline height: ${CENTER_Y + BODY_LIFT} m, tail z: ${zAt(1).toFixed(2)}, t(z=0): ${tAt(0).toFixed(3)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
