import * as THREE from "three";
import type { FlightFrame } from "@/flight/frame";
import { smoothstep } from "@/flight/math";
import { terrainHeight } from "@/flight/terrain";
import { MIN_LIGHT_HEIGHT } from "./lightingUniforms";

/**
 * Sun shadows for the custom surface shaders.
 *
 * The terrain and the structures are drawn with their own shaders, so
 * Three.js's built-in shadows do not reach them. Instead the sun's view of
 * the world is rendered into two depth maps (a detailed one around the
 * aircraft and a coarse one out to the mountains) that those shaders sample
 * through `SHADOW_GLSL`.
 *
 * Nothing in the world moves on its own, so a map stays valid until the
 * aircraft has flown a good part of its width, the sun has turned, or
 * scenery has appeared. Only then is it redrawn, and never both maps in the
 * same frame unless the change demands it.
 */

/** Objects on this layer cast shadows into the detailed map around the aircraft. */
export const SHADOW_LAYER = 1;
/**
 * Objects on this layer also cast into the coarse map out to the mountains.
 * Only the terrain does: at that map's resolution a building's shadow is
 * smaller than a texel.
 */
export const SHADOW_FAR_LAYER = 2;

const MAP_SIZE = 2048;
/** Half the side of the square of ground each map covers, in metres. */
const NEAR_HALF_EXTENT = 1_100;
const FAR_HALF_EXTENT = 9_000;
/** How far up-sun the shadow cameras sit: enough for a low sun behind high peaks. */
const SUN_DISTANCE = 46_000;
/** The sun casts no shadows below `from` degrees and full shadows above `to`. */
const SHADOW_ELEVATION = { from: 1.5, to: 7 } as const;
/** A map is redrawn once its centre is this share of its half-width away from the aircraft. */
const RECENTRE_SHARE = 0.18;
/** ...or once the sun has turned by more than this, in degrees. */
const SUN_TURN = 0.2;
/** Frames to wait before following a change of terrain detail, which is gradual. */
const SOFT_DELAY = 24;

export const shadowUniforms = {
  uShadowNear: { value: null as THREE.Texture | null },
  uShadowFar: { value: null as THREE.Texture | null },
  uShadowNearMatrix: { value: new THREE.Matrix4() },
  uShadowFarMatrix: { value: new THREE.Matrix4() },
  /** x: strength 0–1, y: near texel in metres, z: far texel in metres, w: 1 / map size. */
  uShadowParams: {
    value: new THREE.Vector4(
      0,
      (2 * NEAR_HALF_EXTENT) / MAP_SIZE,
      (2 * FAR_HALF_EXTENT) / MAP_SIZE,
      1 / MAP_SIZE,
    ),
  },
};

export type ShadowUniforms = typeof shadowUniforms;

/** Declarations and lookup for shaders that receive sun shadows. Needs LIGHTING_UNIFORMS. */
export const SHADOW_GLSL = /* glsl */ `
  uniform highp sampler2D uShadowNear;
  uniform highp sampler2D uShadowFar;
  uniform mat4 uShadowNearMatrix;
  uniform mat4 uShadowFarMatrix;
  uniform vec4 uShadowParams;

  // Depth comparisons done in the shader, on the four texels around the
  // point and blended bilinearly, so the shadow edge is smooth. (A plain
  // depth read works everywhere; hardware comparison samplers are stricter
  // about texture state and fail every draw call if anything is off.)
  float shadowTaps(highp sampler2D map, vec3 c) {
    float size = 1.0 / uShadowParams.w;
    vec2 st = c.xy * size - 0.5;
    vec2 f = fract(st);
    vec2 base = (floor(st) + 0.5) * uShadowParams.w;
    float t = uShadowParams.w;
    float a = step(c.z, texture(map, base).r);
    float b = step(c.z, texture(map, base + vec2(t, 0.0)).r);
    float e = step(c.z, texture(map, base + vec2(0.0, t)).r);
    float d = step(c.z, texture(map, base + vec2(t, t)).r);
    return mix(mix(a, b, f.x), mix(e, d, f.x), f.y);
  }

  // 1 in sunlight, 0 in shadow.
  float sunShadow(vec3 world, vec3 normal) {
    float strength = uShadowParams.x;
    if (strength <= 0.001) return 1.0;
    // Look up from a point pushed off the surface, further at grazing
    // angles, so a surface never shadows itself.
    float facing = clamp(dot(normal, uSunDirection), 0.0, 1.0);
    float push = 1.1 + 2.4 * (1.0 - facing);
    vec3 nearCoord = (uShadowNearMatrix * vec4(world + normal * (uShadowParams.y * push), 1.0)).xyz;
    vec2 nearEdge = abs(nearCoord.xy - 0.5) * 2.0;
    float inNear = (1.0 - smoothstep(0.86, 0.98, max(nearEdge.x, nearEdge.y)))
      * step(nearCoord.z, 1.0);
    float lit = 1.0;
    if (inNear > 0.0) lit = shadowTaps(uShadowNear, nearCoord);
    if (inNear < 1.0) {
      vec3 farCoord = (uShadowFarMatrix * vec4(world + normal * (uShadowParams.z * push * 0.6), 1.0)).xyz;
      vec2 farEdge = abs(farCoord.xy - 0.5) * 2.0;
      float inFar = (1.0 - smoothstep(0.9, 1.0, max(farEdge.x, farEdge.y))) * step(farCoord.z, 1.0);
      float farLit = inFar > 0.0 ? mix(1.0, shadowTaps(uShadowFar, farCoord), inFar) : 1.0;
      lit = mix(farLit, lit, inNear);
    }
    return mix(1.0, lit, strength);
  }
`;

interface Cascade {
  target: THREE.WebGLRenderTarget;
  camera: THREE.OrthographicCamera;
  halfExtent: number;
  matrix: THREE.Matrix4;
  /** Where the map was centred and which way the sun was, when it was drawn. */
  centre: THREE.Vector3;
  sun: THREE.Vector3;
  /** False until drawn with the sun up. */
  valid: boolean;
  /** Scenery versions it was drawn with, and the frame. */
  hard: number;
  soft: number;
  drawnAt: number;
}

export interface ShadowRig {
  near: Cascade;
  far: Cascade;
  depthMaterial: THREE.Material;
  /** Frames counted, for the soft-change delay. */
  frame: number;
  /** 1 while shadows are on; eases to 0 when the device cannot afford them. */
  enabled: number;
  /**
   * Whether the maps have been allocated on the GPU. Until a depth texture
   * has been rendered into it does not exist, and a shader sampling it as a
   * shadow sampler makes every draw call fail.
   */
  allocated: boolean;
}

const scenery = { hard: 0, soft: 0 };

/**
 * Call when shadow-casting scenery changes. A hard change (buildings
 * appearing or going) redraws the maps at once; a soft one (terrain tiles
 * changing detail) is followed after a short delay.
 */
export function invalidateSunShadows(hard = true): void {
  if (hard) scenery.hard++;
  else scenery.soft++;
}

function createCascade(
  halfExtent: number,
  texture: THREE.IUniform<THREE.Texture | null>,
  layer: number,
): Cascade {
  const depthTexture = new THREE.DepthTexture(MAP_SIZE, MAP_SIZE, THREE.UnsignedIntType);
  // Read as plain depth values; the shader does the comparison and filtering.
  depthTexture.minFilter = THREE.NearestFilter;
  depthTexture.magFilter = THREE.NearestFilter;
  const target = new THREE.WebGLRenderTarget(MAP_SIZE, MAP_SIZE, {
    depthBuffer: true,
    depthTexture,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const camera = new THREE.OrthographicCamera(
    -halfExtent,
    halfExtent,
    halfExtent,
    -halfExtent,
    500,
    SUN_DISTANCE + 14_000,
  );
  camera.layers.set(layer);
  camera.matrixAutoUpdate = false;
  texture.value = depthTexture;
  return {
    target,
    camera,
    halfExtent,
    matrix: new THREE.Matrix4(),
    centre: new THREE.Vector3(),
    sun: new THREE.Vector3(),
    valid: false,
    hard: -1,
    soft: -1,
    drawnAt: 0,
  };
}

export function createShadowRig(): ShadowRig {
  return {
    near: createCascade(NEAR_HALF_EXTENT, shadowUniforms.uShadowNear, SHADOW_LAYER),
    far: createCascade(FAR_HALF_EXTENT, shadowUniforms.uShadowFar, SHADOW_FAR_LAYER),
    depthMaterial: new THREE.MeshBasicMaterial({
      colorWrite: false,
      // Never tone mapped: keeps one program whether drawn or precompiled.
      toneMapped: false,
      side: THREE.DoubleSide,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: 1.6,
      polygonOffsetUnits: 3,
    }),
    frame: 0,
    enabled: 1,
    allocated: false,
  };
}

/**
 * Compiles the shadow pass's programs (plain and instanced) in the
 * background, so the first shadow redraw does not stall on compilation. The
 * render target is bound, and the real scene supplies the environment, so the
 * programs match the ones the shadow pass will ask for.
 */
export function precompileShadowPrograms(
  rig: ShadowRig,
  gl: THREE.WebGLRenderer,
  target: THREE.Scene,
): void {
  const geometry = new THREE.BoxGeometry();
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, rig.depthMaterial));
  scene.add(new THREE.InstancedMesh(geometry, rig.depthMaterial, 1));
  const previous = gl.getRenderTarget();
  gl.setRenderTarget(rig.near.target);
  const done = gl.compileAsync(scene, rig.near.camera, target);
  gl.setRenderTarget(previous);
  void done.finally(() => geometry.dispose());
}

export function disposeShadowRig(rig: ShadowRig): void {
  for (const cascade of [rig.near, rig.far]) {
    cascade.target.depthTexture?.dispose();
    cascade.target.dispose();
  }
  rig.depthMaterial.dispose();
  shadowUniforms.uShadowNear.value = null;
  shadowUniforms.uShadowFar.value = null;
  shadowUniforms.uShadowParams.value.x = 0;
}

const _sun = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/** Aims a cascade's camera down the sun's rays at `centre`. */
function aimCascade(cascade: Cascade, centre: THREE.Vector3, sun: THREE.Vector3): void {
  const { camera, halfExtent } = cascade;
  // Light-space axes, used to move the map in whole texels: shadows then
  // hold still on the ground instead of crawling as the aircraft moves.
  _right.crossVectors(_worldUp, sun).normalize();
  _up.crossVectors(sun, _right).normalize();
  const texel = (2 * halfExtent) / MAP_SIZE;
  const alongRight = Math.round(centre.dot(_right) / texel) * texel - centre.dot(_right);
  const alongUp = Math.round(centre.dot(_up) / texel) * texel - centre.dot(_up);

  camera.position
    .copy(centre)
    .addScaledVector(_right, alongRight)
    .addScaledVector(_up, alongUp)
    .addScaledVector(sun, SUN_DISTANCE);
  camera.matrix.makeBasis(_right, _up, sun).setPosition(camera.position);
  camera.matrixWorld.copy(camera.matrix);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  cascade.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).premultiply(_bias);
}

function drawCascade(cascade: Cascade, gl: THREE.WebGLRenderer, scene: THREE.Scene): void {
  gl.setRenderTarget(cascade.target);
  gl.clear();
  gl.render(scene, cascade.camera);
}

/**
 * Redraws the shadow maps if anything that affects them has changed.
 * Call once per frame, before the scene is drawn.
 */
export function updateSunShadows(
  rig: ShadowRig,
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  frame: FlightFrame,
): void {
  const { atmosphere, pose } = frame;
  if (!rig.allocated) {
    // Clear both maps to "far" once, so they exist before the sun is up.
    const previousTarget = gl.getRenderTarget();
    for (const cascade of [rig.near, rig.far]) {
      gl.setRenderTarget(cascade.target);
      gl.clear(false, true, false);
    }
    gl.setRenderTarget(previousTarget);
    rig.allocated = true;
  }
  const strength =
    smoothstep(SHADOW_ELEVATION.from, SHADOW_ELEVATION.to, atmosphere.sunElevation) *
    (1 - atmosphere.veil) *
    rig.enabled;
  shadowUniforms.uShadowParams.value.x = strength;
  rig.frame++;
  if (strength <= 0.001) {
    // Redraw once the sun comes back.
    rig.near.valid = false;
    rig.far.valid = false;
    return;
  }

  const [sx, sy, sz] = atmosphere.sunDirection;
  _sun.set(sx, Math.max(sy, MIN_LIGHT_HEIGHT), sz).normalize();
  _centre.set(pose.x, terrainHeight(pose.x, pose.z), pose.z);

  const near = needsRedraw(rig.near, rig.frame);
  const far = needsRedraw(rig.far, rig.frame);
  if (!near && !far) return;

  const previousTarget = gl.getRenderTarget();
  const previousOverride = scene.overrideMaterial;
  const previousAutoClear = gl.autoClear;
  scene.overrideMaterial = rig.depthMaterial;
  gl.autoClear = false;

  if (near) {
    redraw(rig.near, gl, scene, rig.frame);
    shadowUniforms.uShadowNearMatrix.value.copy(rig.near.matrix);
  }
  // The coarse map can wait a frame if the detailed one was just drawn,
  // unless it is out of date.
  if (far && (!near || !rig.far.valid || rig.far.hard !== scenery.hard)) {
    redraw(rig.far, gl, scene, rig.frame);
    shadowUniforms.uShadowFarMatrix.value.copy(rig.far.matrix);
  }

  scene.overrideMaterial = previousOverride;
  gl.autoClear = previousAutoClear;
  gl.setRenderTarget(previousTarget);
}

const SUN_TURN_COS = Math.cos((SUN_TURN * Math.PI) / 180);

/** Does a map no longer match the aircraft's position, the sun or the scenery? */
function needsRedraw(cascade: Cascade, frame: number): boolean {
  if (!cascade.valid || cascade.hard !== scenery.hard) return true;
  const dx = _centre.x - cascade.centre.x;
  const dz = _centre.z - cascade.centre.z;
  if (Math.hypot(dx, dz) > cascade.halfExtent * RECENTRE_SHARE) return true;
  if (cascade.sun.dot(_sun) < SUN_TURN_COS) return true;
  return cascade.soft !== scenery.soft && frame - cascade.drawnAt > SOFT_DELAY;
}

function redraw(cascade: Cascade, gl: THREE.WebGLRenderer, scene: THREE.Scene, frame: number): void {
  aimCascade(cascade, _centre, _sun);
  drawCascade(cascade, gl, scene);
  cascade.centre.copy(_centre);
  cascade.sun.copy(_sun);
  cascade.valid = true;
  cascade.hard = scenery.hard;
  cascade.soft = scenery.soft;
  cascade.drawnAt = frame;
}
