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
  NOISE_FUNCTIONS,
  OUTPUT_CHUNKS,
} from "@/components/flight/shaders/lighting.glsl";
import { type FlightFrame, flightFrame } from "@/flight/frame";

/**
 * Runway geometry in world space (metres). The aircraft starts at the origin
 * facing -Z, 150 m beyond the start threshold.
 */
export const RUNWAY = {
  width: 45,
  length: 3_000,
  /** World Z of the start threshold. */
  startZ: 150,
} as const;

const worldVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------

const groundFragment = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  varying vec3 vWorld;
  ${NOISE_FUNCTIONS}
  ${LIGHTING_FUNCTIONS}

  void main() {
    vec2 p = vWorld.xz;
    float viewDistance = length(vWorld - cameraPosition);

    float broad = fbm(p * 0.0011);
    float mid = fbm(p * 0.009 + 40.0);
    // Fine grain is dropped with distance so it never shimmers.
    float fine = mix(valueNoise(p * 0.4), 0.5, smoothstep(120.0, 700.0, viewDistance));

    vec3 grassDeep = vec3(0.04, 0.078, 0.024);
    vec3 grassLight = vec3(0.082, 0.112, 0.034);
    vec3 dry = vec3(0.15, 0.13, 0.066);
    vec3 albedo = mix(grassDeep, grassLight, smoothstep(0.3, 0.7, broad));
    albedo = mix(albedo, dry, smoothstep(0.55, 0.82, mid) * 0.42);
    albedo *= 0.82 + 0.36 * fine;

    // Mown grass around the runway strip.
    float along = step(-${(RUNWAY.length - RUNWAY.startZ + 120).toFixed(1)}, p.y) * step(p.y, ${(RUNWAY.startZ + 120).toFixed(1)});
    float strip = (1.0 - smoothstep(40.0, 260.0, abs(p.x))) * along;
    albedo = mix(albedo, vec3(0.07, 0.098, 0.036) * (0.9 + 0.2 * fine), strip * 0.4);

    vec3 color = surfaceLight(albedo, vec3(0.0, 1.0, 0.0));
    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

// ---------------------------------------------------------------------------
// Runway surface and markings
// ---------------------------------------------------------------------------

const runwayFragment = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  uniform vec2 uAircraft;
  uniform vec2 uAircraftForward;
  uniform float uLandingLights;
  varying vec3 vWorld;
  ${NOISE_FUNCTIONS}
  ${LIGHTING_FUNCTIONS}

  // 1 inside [lo, hi], antialiased by aa.
  float band(float x, float lo, float hi, float aa) {
    return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
  }

  void main() {
    float u = vWorld.x;
    float v = ${RUNWAY.startZ.toFixed(1)} - vWorld.z; // metres from the start threshold
    float L = ${RUNWAY.length.toFixed(1)};
    float viewDistance = length(vWorld - cameraPosition);

    float au = fwidth(u) * 0.8 + 0.008;
    float av = fwidth(v) * 0.8 + 0.008;
    float ax = abs(u);
    // Markings are mirrored about the runway midpoint.
    float vm = min(v, L - v);

    // --- Markings ---------------------------------------------------------
    float edge = band(ax, 20.6, 21.5, au);
    float dash = band(mod(v, 50.0), 0.0, 30.0, av);
    float centre = band(ax, -1.0, 0.45, au) * dash * smoothstep(78.0, 82.0, vm);
    float threshold = band(mod(ax - 1.8, 3.4), 0.0, 1.7, au) * band(ax, 1.8, 20.3, au) * band(vm, 6.0, 36.0, av);
    float aiming = band(ax, 5.2, 11.6, au) * band(vm, 400.0, 445.0, av);
    float tdzBars = band(mod(ax - 4.6, 2.3), 0.0, 1.5, au) * band(ax, 4.6, 11.4, au);
    float touchdown = tdzBars * (band(vm, 150.0, 172.5, av) + band(vm, 300.0, 322.5, av) + band(vm, 600.0, 622.5, av));
    float paint = clamp(edge + centre + threshold + aiming + touchdown, 0.0, 1.0);
    // Stop markings from sparkling far away, where they are thinner than a pixel.
    paint *= 1.0 - smoothstep(2200.0, 5200.0, viewDistance) * 0.55;

    // --- Asphalt ------------------------------------------------------------
    float streaks = fbm(vec2(u * 0.9, v * 0.045));
    float grain = mix(valueNoise(vec2(u, v) * 2.6), 0.5, smoothstep(40.0, 260.0, viewDistance));
    vec3 asphalt = vec3(0.034, 0.036, 0.04) * (0.72 + 0.5 * streaks) * (0.84 + 0.32 * grain);
    // The wheel paths are worn paler than the shoulders.
    asphalt *= 1.0 + 0.22 * (1.0 - smoothstep(4.0, 13.0, ax));
    // Rubber left in the touchdown zones.
    float rubber = (1.0 - smoothstep(3.0, 10.0, ax)) * band(vm, 130.0, 900.0, 60.0)
      * (0.45 + 0.55 * fbm(vec2(u * 1.6, v * 0.02)));
    asphalt *= 1.0 - 0.5 * rubber;

    vec3 paintColor = vec3(0.6, 0.6, 0.57) * (0.7 + 0.3 * streaks) * (1.0 - 0.45 * rubber);
    vec3 albedo = mix(asphalt, paintColor, paint);

    vec3 normal = vec3(0.0, 1.0, 0.0);
    vec3 color = surfaceLight(albedo, normal);

    // Pool of light thrown ahead by the aircraft's landing lights.
    vec2 fromAircraft = vWorld.xz - uAircraft;
    float ahead = dot(fromAircraft, uAircraftForward);
    float aside = dot(fromAircraft, vec2(uAircraftForward.y, -uAircraftForward.x));
    float spread = 3.5 + ahead * 0.16;
    float pool = smoothstep(4.0, 22.0, ahead) * exp(-ahead / 85.0) * exp(-(aside * aside) / (spread * spread));
    color += albedo * vec3(1.0, 0.95, 0.86) * (pool * uLandingLights * 1.6);

    // Grazing-angle sheen: the surface picks up the sky near the horizon,
    // strongest toward the sun's bearing.
    vec3 view = normalize(cameraPosition - vWorld);
    float fresnel = pow(1.0 - max(view.y, 0.0), 5.0);
    vec2 reflected = normalize(-view.xz + vec2(1e-5));
    vec2 sunBearing = normalize(uSunDirection.xz + vec2(1e-5));
    float toward = pow(max(dot(reflected, sunBearing), 0.0), 10.0);
    vec3 skyTint = uFogColor * 1.3 + uGlow * uGlowStrength * toward * 0.42;
    // Added on top of the surface, so painted markings stay lighter than asphalt.
    color += skyTint * fresnel * 0.2;

    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

// ---------------------------------------------------------------------------
// Runway lights
// ---------------------------------------------------------------------------

const lightsVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uPixelsPerUnit;
  uniform float uPixelRatio;
  uniform float uFogDensity;
  varying vec3 vColor;
  varying float vVisibility;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float viewDistance = -mvPosition.z;
    // World-sized up close, but never smaller than a couple of pixels, which
    // is how distant runway lights read in reality.
    float pixels = aSize * uPixelsPerUnit / max(viewDistance, 1.0);
    gl_PointSize = clamp(pixels, 2.2, 24.0) * uPixelRatio;
    vColor = aColor;
    // Lights carry further through haze than surfaces do.
    vVisibility = exp(-uFogDensity * uFogDensity * viewDistance * viewDistance * 0.35);
  }
`;

const lightsFragment = /* glsl */ `
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vVisibility;

  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.0, d);
    float glow = pow(core, 2.6) + 0.35 * pow(core, 9.0);
    gl_FragColor = vec4(vColor * glow * uIntensity * vVisibility, 1.0);
    #include <colorspace_fragment>
  }
`;

interface LampSpec {
  x: number;
  y: number;
  z: number;
  color: readonly [number, number, number];
  size: number;
}

const WHITE = [1, 0.94, 0.8] as const;
const COOL_WHITE = [0.92, 0.96, 1] as const;
const AMBER = [1, 0.66, 0.2] as const;
const RED = [1, 0.13, 0.08] as const;
const GREEN = [0.2, 1, 0.42] as const;

/** Lays out the runway lighting: edges, centreline, thresholds, touchdown zone, approach. */
export function runwayLamps(): LampSpec[] {
  const lamps: LampSpec[] = [];
  const zOf = (v: number) => RUNWAY.startZ - v;
  const add = (u: number, v: number, color: LampSpec["color"], size: number, y = 0.35) =>
    lamps.push({ x: u, y, z: zOf(v), color, size });

  // Edge lights, amber over the last 600 m.
  for (let v = 0; v <= RUNWAY.length; v += 60) {
    const color = v > RUNWAY.length - 600 ? AMBER : WHITE;
    add(-23.4, v, color, 1.15);
    add(23.4, v, color, 1.15);
  }
  // Centreline, turning red toward the far end.
  for (let v = 30, i = 0; v <= RUNWAY.length - 30; v += 15, i++) {
    const remaining = RUNWAY.length - v;
    const color = remaining < 300 ? RED : remaining < 900 && i % 2 === 0 ? RED : COOL_WHITE;
    add(0, v, color, 0.5, 0.06);
  }
  // Thresholds: green to enter, red at the far end.
  for (let u = -21; u <= 21; u += 3) {
    add(u, -3, GREEN, 1);
    add(u, RUNWAY.length + 3, RED, 1);
  }
  // Touchdown zone barrettes.
  for (let v = 30; v <= 900; v += 30) {
    for (const u of [5.5, 7, 8.5]) {
      add(u, v, WHITE, 0.42, 0.06);
      add(-u, v, WHITE, 0.42, 0.06);
    }
  }
  // Approach lighting behind the start threshold.
  for (let v = -30; v >= -420; v -= 30) {
    for (let u = -4; u <= 4; u += 2) add(u, v, WHITE, 1, 0.8);
  }
  for (let u = -15; u <= 15; u += 2.5) add(u, -300, WHITE, 1, 0.8);

  return lamps;
}

interface LampUniforms {
  [uniform: string]: THREE.IUniform;
  uPixelsPerUnit: THREE.IUniform<number>;
  uPixelRatio: THREE.IUniform<number>;
  uFogDensity: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
}

interface RunwayUniforms extends LightingUniforms {
  uAircraft: THREE.IUniform<THREE.Vector2>;
  uAircraftForward: THREE.IUniform<THREE.Vector2>;
  uLandingLights: THREE.IUniform<number>;
}

interface AirportHandles {
  ground: THREE.Mesh | null;
  groundUniforms: LightingUniforms;
  runwayUniforms: RunwayUniforms;
  lampUniforms: LampUniforms;
}

/** Ground tiles snap in steps of this size as the aircraft moves. */
const GROUND_SNAP = 1_000;

function updateAirport(
  handles: AirportHandles,
  frame: FlightFrame,
  camera: THREE.Camera,
  gl: THREE.WebGLRenderer,
): void {
  const { atmosphere, pose } = frame;
  updateLightingUniforms(handles.groundUniforms, atmosphere);
  updateLightingUniforms(handles.runwayUniforms, atmosphere);
  handles.runwayUniforms.uAircraft.value.set(pose.x, pose.z);
  handles.runwayUniforms.uAircraftForward.value.set(Math.sin(pose.yaw), Math.cos(pose.yaw));
  // The pool fades as the aircraft climbs away from the surface.
  handles.runwayUniforms.uLandingLights.value = pose.landingLights * Math.max(0, 1 - pose.y / 60);

  if (handles.ground) {
    handles.ground.position.x = Math.round(pose.x / GROUND_SNAP) * GROUND_SNAP;
    handles.ground.position.z = Math.round(pose.z / GROUND_SNAP) * GROUND_SNAP;
  }

  const lamps = handles.lampUniforms;
  if (camera instanceof THREE.PerspectiveCamera) {
    const height = gl.domElement.height / gl.getPixelRatio();
    lamps.uPixelsPerUnit.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  }
  lamps.uPixelRatio.value = gl.getPixelRatio();
  lamps.uFogDensity.value = atmosphere.fogDensity;
  lamps.uIntensity.value = 0.25 + 1.75 * atmosphere.lamps;
}

/**
 * The departure airport: runway with full markings and lighting, on open
 * ground. Terminal buildings, taxiways and the coastline arrive with the
 * environment phase.
 */
export function Airport() {
  const groundRef = useRef<THREE.Mesh>(null);
  const handles = useRef<AirportHandles | null>(null);

  const built = useMemo(() => {
    const groundUniforms = createLightingUniforms();
    const groundMaterial = new THREE.ShaderMaterial({
      uniforms: groundUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: worldVertex,
      fragmentShader: groundFragment,
    });

    const runwayUniforms: RunwayUniforms = {
      ...createLightingUniforms(),
      uAircraft: { value: new THREE.Vector2() },
      uAircraftForward: { value: new THREE.Vector2(0, -1) },
      uLandingLights: { value: 1 },
    };
    const runwayMaterial = new THREE.ShaderMaterial({
      uniforms: runwayUniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: worldVertex,
      fragmentShader: runwayFragment,
      // The runway lies on the ground plane; draw it as a decal so the two
      // never z-fight at distance.
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -8,
    });

    const lamps = runwayLamps();
    const lampGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(lamps.length * 3);
    const colors = new Float32Array(lamps.length * 3);
    const sizes = new Float32Array(lamps.length);
    lamps.forEach((lamp, i) => {
      positions.set([lamp.x, lamp.y, lamp.z], i * 3);
      colors.set(lamp.color, i * 3);
      sizes[i] = lamp.size;
    });
    lampGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    lampGeometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    lampGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    lampGeometry.computeBoundingSphere();

    const lampUniforms: LampUniforms = {
      uPixelsPerUnit: { value: 800 },
      uPixelRatio: { value: 1 },
      uFogDensity: { value: 0 },
      uIntensity: { value: 1 },
    };
    const lampMaterial = new THREE.ShaderMaterial({
      uniforms: lampUniforms,
      vertexShader: lightsVertex,
      fragmentShader: lightsFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    return {
      groundUniforms,
      groundMaterial,
      runwayUniforms,
      runwayMaterial,
      lampGeometry,
      lampUniforms,
      lampMaterial,
    };
  }, []);

  useEffect(() => {
    handles.current = {
      ground: groundRef.current,
      groundUniforms: built.groundUniforms,
      runwayUniforms: built.runwayUniforms,
      lampUniforms: built.lampUniforms,
    };
    return () => {
      handles.current = null;
      built.groundMaterial.dispose();
      built.runwayMaterial.dispose();
      built.lampMaterial.dispose();
      built.lampGeometry.dispose();
    };
  }, [built]);

  useFrame((state) => {
    if (handles.current) updateAirport(handles.current, flightFrame, state.camera, state.gl);
  });

  const runwayCentreZ = RUNWAY.startZ - RUNWAY.length / 2;

  return (
    <group>
      <mesh
        ref={groundRef}
        rotation-x={-Math.PI / 2}
        material={built.groundMaterial}
        frustumCulled={false}
        renderOrder={-10}
      >
        <planeGeometry args={[120_000, 120_000]} />
      </mesh>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0, runwayCentreZ]}
        material={built.runwayMaterial}
        renderOrder={-9}
      >
        <planeGeometry args={[RUNWAY.width, RUNWAY.length]} />
      </mesh>
      <points geometry={built.lampGeometry} material={built.lampMaterial} renderOrder={5} />
    </group>
  );
}
