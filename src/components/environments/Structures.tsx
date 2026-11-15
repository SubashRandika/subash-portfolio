"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
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
import { flightFrame } from "@/flight/frame";
import { STRUCTURE_KINDS, type Structure } from "@/flight/structures";

const K = STRUCTURE_KINDS;

const vertexShader = /* glsl */ `
  attribute vec4 aStyle;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObjectNormal;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec4 vStyle;

  void main() {
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    // Instances are scaled along their own axes, which keeps box and
    // cylinder normals pointing the right way after normalising.
    vNormal = normalize(mat3(model) * normal);
    vObjectNormal = normal;
    vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    // Metres within the structure, from the centre of its base.
    vLocal = position * vSize;
    vStyle = aStyle;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec3 vObjectNormal;
  varying vec3 vLocal;
  varying vec3 vSize;
  varying vec4 vStyle;
  ${NOISE_FUNCTIONS}
  ${LIGHTING_FUNCTIONS}

  float band(float x, float lo, float hi, float aa) {
    return smoothstep(lo - aa, lo + aa, x) * (1.0 - smoothstep(hi - aa, hi + aa, x));
  }

  // Sky seen in a reflective surface.
  vec3 skyReflection(vec3 R) {
    vec2 bearing = normalize(R.xz + vec2(1e-5));
    vec2 sunBearing = normalize(uSunDirection.xz + vec2(1e-5));
    vec3 sky = mix(uFogColor, uAmbientSky * (0.45 * uAmbientIntensity), clamp(R.y * 1.4, 0.0, 1.0));
    sky += uGlow * (uGlowStrength * 0.5 * pow(max(dot(bearing, sunBearing), 0.0), 5.0) * (1.0 - clamp(R.y * 3.0, 0.0, 1.0)));
    // Below the horizon a window reflects the darker ground.
    sky = mix(sky, uAmbientGround * 0.35, smoothstep(0.0, -0.25, R.y));
    sky += uSunColor * (pow(max(dot(R, uSunDirection), 0.0), 260.0) * uSunIntensity * 1.4);
    return sky;
  }

  vec3 palette5(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e) {
    return t < 0.2 ? a : t < 0.4 ? b : t < 0.6 ? c : t < 0.8 ? d : e;
  }

  void main() {
    int kind = int(vStyle.x + 0.5);
    float seed = vStyle.y;
    bool cylinder = vStyle.z > 0.5;
    vec3 N = normalize(vNormal);
    vec3 toCamera = cameraPosition - vWorld;
    float viewDistance = length(toCamera);
    vec3 V = toCamera / viewDistance;
    bool top = vObjectNormal.y > 0.5;
    bool bottom = vObjectNormal.y < -0.5;

    // Facade coordinates in metres: along the wall, and up from the base.
    float u = cylinder
      ? atan(vLocal.z, vLocal.x) * vSize.x * 0.5
      : (abs(vObjectNormal.x) > 0.5 ? vLocal.z : vLocal.x);
    float v = vLocal.y;
    float aaU = fwidth(u) + 1e-3;
    float aaV = fwidth(v) + 1e-3;
    // Detail smaller than a pixel or two is averaged away.
    float coarse = smoothstep(0.35, 1.2, max(aaU, aaV));

    vec3 albedo = vec3(0.3);
    float glass = 0.0;
    vec3 glassTint = vec3(0.05, 0.07, 0.08);

    if (kind == ${K.tower}) {
      glassTint = palette5(seed, vec3(0.04, 0.07, 0.09), vec3(0.06, 0.06, 0.06), vec3(0.08, 0.07, 0.05),
        vec3(0.05, 0.08, 0.08), vec3(0.07, 0.08, 0.1));
      vec3 frame = palette5(fract(seed * 7.0), vec3(0.42), vec3(0.24), vec3(0.55, 0.52, 0.47), vec3(0.16), vec3(0.38, 0.4, 0.43));
      float fv = fract(v / 3.9);
      float fu = fract(u / 1.55);
      float spandrel = band(fv, -0.05, 0.2, aaV / 3.9);
      float mullion = band(fu, -0.05, 0.06, aaU / 1.55);
      glass = mix((1.0 - spandrel) * (1.0 - mullion), 0.74, coarse);
      albedo = frame;
      if (top) { albedo = vec3(0.22, 0.22, 0.225); glass = 0.0; }
    } else if (kind == ${K.office}) {
      albedo = palette5(seed, vec3(0.46, 0.44, 0.41), vec3(0.52, 0.45, 0.35), vec3(0.62, 0.61, 0.58),
        vec3(0.36, 0.19, 0.13), vec3(0.36, 0.36, 0.37));
      float fv = fract(v / 3.4);
      float fu = fract(u / 3.1);
      float window = band(fv, 0.32, 0.86, aaV / 3.4) * band(fu, 0.16, 0.84, aaU / 3.1);
      window *= step(3.6, v) * step(v, vSize.y - 1.0);
      glass = mix(window, 0.3, coarse);
      // Darker shopfronts at street level.
      albedo *= mix(0.62, 1.0, smoothstep(3.2, 4.0, v));
      if (top) {
        float roof = fract(seed * 13.0);
        albedo = (roof < 0.25 ? vec3(0.55, 0.55, 0.53) : roof < 0.35 ? vec3(0.12, 0.17, 0.08) : vec3(0.27, 0.27, 0.26))
          * (0.85 + 0.3 * valueNoise(vLocal.xz / 4.0));
        glass = 0.0;
      }
    } else if (kind == ${K.industrial}) {
      albedo = palette5(seed, vec3(0.42, 0.43, 0.44), vec3(0.2, 0.26, 0.33), vec3(0.54, 0.54, 0.52),
        vec3(0.24, 0.3, 0.27), vec3(0.36, 0.34, 0.3));
      float ribs = 0.5 + 0.5 * sin(u * 7.85);
      albedo *= 1.0 + 0.07 * mix(ribs - 0.5, 0.0, coarse);
      float strip = band(v, vSize.y - 4.2, vSize.y - 2.8, aaV) * step(0.5, seed);
      float door = band(fract(u / 26.0), 0.3, 0.62, aaU / 26.0) * step(v, 6.5) * step(0.3, fract(seed * 3.0));
      albedo = mix(albedo, vec3(0.1, 0.105, 0.11), door);
      glass = strip * (1.0 - coarse * 0.5);
      if (top) {
        float roofRibs = 0.5 + 0.5 * sin(vLocal.x * 2.4);
        albedo = vec3(0.4, 0.41, 0.41) * (1.0 + 0.06 * mix(roofRibs - 0.5, 0.0, coarse));
        glass = 0.0;
      }
    } else if (kind == ${K.terminal}) {
      albedo = vec3(0.46, 0.46, 0.45);
      float fv = fract(v / 4.5);
      float fu = fract(u / 2.0);
      glass = mix((1.0 - band(fv, -0.05, 0.16, aaV / 4.5)) * (1.0 - band(fu, -0.05, 0.05, aaU / 2.0)), 0.7, coarse);
      glass *= step(1.0, v);
      if (top) { albedo = vec3(0.42); glass = 0.0; }
    } else if (kind == ${K.tank}) {
      albedo = vec3(0.56, 0.56, 0.54) * (0.96 + 0.04 * step(0.5, fract(v / 2.0)));
      if (top) albedo = vec3(0.48, 0.48, 0.47);
    } else if (kind == ${K.containers}) {
      // One instance is a row of containers, stacked: colour each box.
      float along = cylinder ? 0.0 : vLocal.x + vSize.x * 0.5;
      float box = floor(along / 12.2);
      float tier = floor(v / 2.6);
      float r = hash21(vec2(box, tier) + seed * 91.0);
      albedo = palette5(r, vec3(0.32, 0.09, 0.05), vec3(0.05, 0.13, 0.3), vec3(0.08, 0.2, 0.12),
        vec3(0.46, 0.19, 0.04), vec3(0.45, 0.45, 0.43));
      float seam = (1.0 - band(fract(along / 12.2), 0.015, 0.985, aaU / 12.2)) + (1.0 - band(fract(v / 2.6), 0.03, 0.97, aaV / 2.6));
      albedo *= 1.0 - 0.5 * clamp(seam, 0.0, 1.0) * (1.0 - coarse);
      albedo *= 1.0 + 0.08 * (sin(along * 9.0) * (1.0 - coarse));
    } else if (kind == ${K.bridge}) {
      albedo = vec3(0.34, 0.335, 0.32);
      if (top) {
        albedo = vec3(0.06, 0.062, 0.066);
        float lane = band(abs(vLocal.z), 0.0, 0.15, fwidth(vLocal.z)) * step(0.5, fract(vLocal.x / 12.0));
        albedo = mix(albedo, vec3(0.5, 0.5, 0.48), lane * (1.0 - coarse));
      }
      if (bottom) albedo *= 0.5;
    } else if (kind == ${K.stack}) {
      albedo = vec3(0.36, 0.35, 0.33);
      // Aviation markings: red and white bands near the top.
      float fromTop = vSize.y - v;
      float marked = step(fromTop, 15.0);
      float stripe = step(0.5, fract(fromTop / 5.0));
      albedo = mix(albedo, mix(vec3(0.5, 0.06, 0.04), vec3(0.6, 0.6, 0.58), stripe), marked);
      if (top) albedo = vec3(0.05);
    }

    // Variation between individual panels and buildings.
    albedo *= 0.9 + 0.2 * valueNoise(vec2(u, v) / 9.0 + seed * 40.0);
    // Contact darkening where walls meet the ground.
    if (!top) albedo *= mix(0.55, 1.0, smoothstep(0.0, 6.0, v));

    vec3 color = surfaceLight(albedo, N);
    if (glass > 0.001) {
      vec3 R = reflect(-V, N);
      // Each pane reflects slightly differently.
      float pane = hash21(floor(vec2(u / 1.55, v / 3.9)) + seed * 13.0);
      float fresnel = 0.06 + 0.94 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      vec3 body = surfaceLight(glassTint, N);
      vec3 reflection = skyReflection(R) * (0.75 + 0.35 * mix(pane, 0.5, coarse));
      vec3 glazing = mix(body, reflection, clamp(0.5 + 0.5 * fresnel, 0.0, 1.0));
      color = mix(color, glazing, glass);
    }

    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

/** One material for every structure, compiled once and kept. */
let shared: { material: THREE.ShaderMaterial; uniforms: LightingUniforms } | null = null;

function structureMaterial() {
  if (!shared) {
    const uniforms = createLightingUniforms();
    shared = {
      uniforms,
      material: new THREE.ShaderMaterial({
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        vertexShader,
        fragmentShader,
      }),
    };
  }
  return shared;
}

let boxGeometry: THREE.BufferGeometry | null = null;
let cylinderGeometry: THREE.BufferGeometry | null = null;

function geometries() {
  // Unit shapes standing on their base; instances scale them to size.
  boxGeometry ??= new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  cylinderGeometry ??= new THREE.CylinderGeometry(0.5, 0.5, 1, 20, 1).translate(0, 0.5, 0);
  return { box: boxGeometry, cylinder: cylinderGeometry };
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _rotation = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function buildInstances(
  items: readonly Structure[],
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  cylinder: boolean,
): THREE.InstancedMesh | null {
  if (items.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const styles = new Float32Array(items.length * 4);
  items.forEach((item, index) => {
    _position.set(item.x, item.y, item.z);
    _rotation.setFromAxisAngle(_up, item.rotation);
    _scale.set(item.width, item.height, item.depth);
    mesh.setMatrixAt(index, _matrix.compose(_position, _rotation, _scale));
    styles.set([STRUCTURE_KINDS[item.kind], item.seed, cylinder ? 1 : 0, 0], index * 4);
  });
  // A per-mesh attribute: the shared geometry must not carry it.
  mesh.geometry = geometry.clone();
  mesh.geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 4));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.matrixAutoUpdate = false;
  return mesh;
}

interface StructuresProps {
  items: readonly Structure[];
}

/**
 * Draws a set of structures as two instanced meshes (boxes and cylinders)
 * sharing one shader, so a whole city is a couple of draw calls.
 */
export function Structures({ items }: StructuresProps) {
  const built = useMemo(() => {
    const { material } = structureMaterial();
    const { box, cylinder } = geometries();
    const group = new THREE.Group();
    const boxes = buildInstances(
      items.filter((item) => item.shape === "box"),
      box,
      material,
      false,
    );
    const cylinders = buildInstances(
      items.filter((item) => item.shape === "cylinder"),
      cylinder,
      material,
      true,
    );
    const meshes = [boxes, cylinders].filter((mesh): mesh is THREE.InstancedMesh => mesh !== null);
    for (const mesh of meshes) group.add(mesh);
    return { group, meshes };
  }, [items]);

  useEffect(
    () => () => {
      for (const mesh of built.meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [built],
  );

  useFrame(() => {
    updateLightingUniforms(structureMaterial().uniforms, flightFrame.atmosphere);
  });

  return <primitive object={built.group} />;
}
