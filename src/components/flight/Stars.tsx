"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { flightFrame } from "@/flight/frame";
import { CIRRUS_GLSL } from "./shaders/cirrus.glsl";
import { OUTPUT_CHUNKS } from "./shaders/lighting.glsl";

/** Stars in the dome. Twilight leaves only a sparse field of the brighter ones. */
const STAR_COUNT = 1100;

/**
 * Seeded generator (mulberry32), so the sky is the same on every visit and
 * in every test run.
 */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Star colours by temperature, linear RGB: hot blue-white to cool orange. */
const TINTS: readonly (readonly [number, number, number, number])[] = [
  // [share, r, g, b]
  [0.18, 0.66, 0.78, 1.0],
  [0.42, 0.9, 0.94, 1.0],
  [0.26, 1.0, 0.95, 0.84],
  [0.1, 1.0, 0.82, 0.6],
  [0.04, 1.0, 0.66, 0.44],
];

function tintFor(pick: number): readonly [number, number, number] {
  let total = 0;
  for (const [share, r, g, b] of TINTS) {
    total += share;
    if (pick <= total) return [r, g, b];
  }
  const last = TINTS[TINTS.length - 1]!;
  return [last[1], last[2], last[3]];
}

/**
 * Builds the star field: directions spread evenly over the sky, brightness
 * following a steep magnitude curve (many faint stars, a handful of bright
 * ones), sprite size following brightness so faint stars cost a few pixels.
 */
export function buildStarField(count = STAR_COUNT, seed = 20130617): THREE.BufferGeometry {
  const next = random(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightness = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Uniform over the upper hemisphere (and a sliver below, for hills).
    const y = -0.04 + 1.04 * next();
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = next() * Math.PI * 2;
    positions.set([Math.cos(angle) * ring, y, Math.sin(angle) * ring], i * 3);

    const magnitude = next();
    const bright = 0.06 + 0.94 * Math.pow(magnitude, 6);
    brightness[i] = bright;
    // Sprite edge in CSS pixels: the core plus room for the halo.
    sizes[i] = 3.5 + 21 * Math.pow(magnitude, 6);
    colors.set(tintFor(next()), i * 3);
    phases[i] = next();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aBright", new THREE.BufferAttribute(brightness, 1));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  return geometry;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uStars;
  uniform float uCirrus;
  uniform float uVeil;
  uniform float uPixelRatio;
  uniform vec3 uSunDirection;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aBright;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vCore;
  varying float vSpikes;

  ${CIRRUS_GLSL}

  void main() {
    vec3 dir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // On the far plane, like the dome: anything else in the scene covers them.
    gl_Position.z = gl_Position.w;

    float altitude = dir.y;
    float visible = uStars * (1.0 - uVeil) * smoothstep(0.0, 0.1, altitude);
    // Washed out by the bright glow low over the sun; higher up on the same
    // side of the sky they still show, as they do before dawn.
    float mu = max(dot(dir, uSunDirection), 0.0);
    visible *= 1.0 - 0.9 * smoothstep(0.75, 0.97, mu) * (1.0 - smoothstep(0.04, 0.3, altitude));
    // Hidden behind the cirrus drawn in the dome.
    visible *= 1.0 - 0.9 * cirrusDensity(dir, uTime, uCirrus);

    // Scintillation: the thicker, more turbulent air near the horizon makes
    // low stars twinkle harder and faster than those overhead.
    float air = 1.0 - smoothstep(0.06, 0.65, altitude);
    float t = uTime * mix(1.0, 1.9, air);
    float flicker =
      0.55 * sin(t * (1.1 + aPhase * 1.7) + aPhase * 43.0) +
      0.3 * sin(t * (2.9 + aPhase * 2.3) + aPhase * 17.0) +
      0.15 * sin(t * (6.3 + aPhase * 4.1) + aPhase * 71.0);
    float twinkle = max(1.0 + flicker * mix(0.16, 0.5, air), 0.15);

    float intensity = aBright * visible * twinkle;
    vColor = aColor * intensity * 2.6;
    // Core radius as a share of the sprite: bright stars have wide halos.
    vCore = mix(0.42, 0.13, smoothstep(4.0, 20.0, aSize));
    // Only the brightest stars show faint diffraction spikes.
    vSpikes = smoothstep(14.0, 24.0, aSize);
    gl_PointSize = aSize * uPixelRatio;
    // Skip stars that would not show at all.
    if (intensity < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vCore;
  varying float vSpikes;

  void main() {
    vec2 uv = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(uv, uv);
    if (r2 > 1.0) discard;
    float r = sqrt(r2);
    // A sharp core, a soft halo that reaches the sprite edge at zero, and
    // for the brightest stars two hairline spikes.
    float core = exp(-r2 / (vCore * vCore));
    float halo = exp(-r * 5.5) * 0.32 * (1.0 - r2);
    float spikes = vSpikes * (exp(-abs(uv.x) * 55.0) + exp(-abs(uv.y) * 55.0)) * pow(1.0 - r, 3.0) * 0.5;
    gl_FragColor = vec4(vColor * (core + halo + spikes), 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

interface StarUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uStars: THREE.IUniform<number>;
  uCirrus: THREE.IUniform<number>;
  uVeil: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
}

/**
 * Stars as glowing points before dawn: each has a core, a halo and a
 * colour by temperature, twinkles (more so near the horizon), fades into the
 * dawn glow and hides behind the dome's cirrus.
 */
export function Stars() {
  const pointsRef = useRef<THREE.Points>(null);

  const built = useMemo(() => {
    const geometry = buildStarField();
    const uniforms: StarUniforms = {
      uTime: { value: 0 },
      uStars: { value: 0 },
      uCirrus: { value: 0 },
      uVeil: { value: 0 },
      uPixelRatio: { value: 1 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    return { geometry, material };
  }, []);

  useEffect(() => {
    return () => {
      built.geometry.dispose();
      built.material.dispose();
    };
  }, [built]);

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;
    const atmosphere = flightFrame.atmosphere;
    const uniforms = (points.material as THREE.ShaderMaterial).uniforms as StarUniforms;
    uniforms.uStars.value = atmosphere.stars;
    // Nothing to draw in daylight.
    points.visible = atmosphere.stars > 0.001 && atmosphere.veil < 0.999;
    if (!points.visible) return;
    uniforms.uTime.value = flightFrame.time;
    uniforms.uCirrus.value = atmosphere.cirrus;
    uniforms.uVeil.value = atmosphere.veil;
    uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    uniforms.uSunDirection.value.set(...atmosphere.sunDirection).normalize();
    // Centred on the camera, so the stars never show parallax.
    points.position.copy(state.camera.position);
  });

  return (
    <points
      ref={pointsRef}
      geometry={built.geometry}
      material={built.material}
      scale={1000}
      frustumCulled={false}
      renderOrder={-999}
    />
  );
}
