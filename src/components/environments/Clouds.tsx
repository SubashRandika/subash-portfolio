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
  OUTPUT_CHUNKS,
} from "@/components/flight/shaders/lighting.glsl";
import { CLOUD_GLSL, CLOUD_LAYERS, cloudCover } from "@/flight/clouds";
import { flightFrame } from "@/flight/frame";
import { TERRAIN_GLSL } from "@/flight/terrain";

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  ${LIGHTING_UNIFORMS}
  uniform float uLayer;
  varying vec3 vWorld;
  ${TERRAIN_GLSL}
  ${CLOUD_GLSL}
  ${LIGHTING_FUNCTIONS}

  void main() {
    vec2 p = vWorld.xz;
    float cover = tCloudCover(-p.y);
    // The upper layer is thinner and wispier.
    cover *= uLayer > 0.5 ? 0.55 : 1.0;
    if (cover < 0.01) discard;

    vec2 q = p / (uLayer > 0.5 ? 3400.0 : 2400.0) + vec2(uLayer * 17.0, 3.0);
    vec2 warp = vec2(tFbm(q * 0.6 + 5.0, 3), tFbm(q * 0.6 + 9.0, 3)) - 0.5;
    float density = tFbm(q + warp * 1.3, 5);
    float threshold = mix(0.74, 0.3, cover);
    float shape = smoothstep(threshold, threshold + 0.16, density);
    if (shape < 0.003) discard;
    float thickness = clamp((density - threshold) / 0.32, 0.0, 1.0);

    vec3 toCamera = cameraPosition - vWorld;
    float viewDistance = length(toCamera);
    vec3 V = toCamera / viewDistance;
    bool below = cameraPosition.y < vWorld.y;

    // Tops are lit by the sun; thin edges let light through toward the sun;
    // bases are in the cloud's own shade.
    // Relief: the density field's slope in world space, from screen-space
    // derivatives, so the tops of the clouds are lit and shaded by the sun.
    vec2 dpx = dFdx(p);
    vec2 dpy = dFdy(p);
    vec2 dd = vec2(dFdx(density), dFdy(density));
    float det = dpx.x * dpy.y - dpx.y * dpy.x;
    vec2 gradient = abs(det) > 1e-6
      ? vec2(dpy.y * dd.x - dpx.y * dd.y, -dpy.x * dd.x + dpx.x * dd.y) / det
      : vec2(0.0);
    vec3 normal = normalize(vec3(-gradient.x * 900.0, 1.0, -gradient.y * 900.0));

    vec3 white = vec3(0.86);
    vec3 color = surfaceLight(white, normal) * (0.74 + 0.26 * thickness);
    float forward = pow(max(dot(-V, uSunDirection), 0.0), 6.0);
    color += uSunColor * uSunIntensity * (0.12 * forward * (1.0 - thickness));
    if (below) color = surfaceLight(white * mix(0.75, 0.42, thickness), vec3(0.0, 1.0, 0.0)) * 0.7;

    float alpha = shape * mix(0.7, 0.97, thickness);
    // Dissolve as the camera passes through the layer; the haze takes over.
    alpha *= smoothstep(25.0, 140.0, abs(cameraPosition.y - vWorld.y));
    alpha *= 1.0 - smoothstep(26000.0, 42000.0, viewDistance);

    color = applyFog(color, vWorld - cameraPosition);
    gl_FragColor = vec4(color, alpha);
    ${OUTPUT_CHUNKS}
  }
`;

/** The layers follow the camera; their pattern is anchored to the world. */
const LAYER_SIZE = 90_000;
const FOLLOW_STEP = 500;

interface CloudLayers {
  meshes: THREE.Mesh[];
  materials: THREE.ShaderMaterial[];
  uniforms: LightingUniforms[];
  geometry: THREE.PlaneGeometry;
}

function updateClouds(layers: CloudLayers, camera: THREE.Camera): void {
  const { atmosphere } = flightFrame;
  const x = Math.round(camera.position.x / FOLLOW_STEP) * FOLLOW_STEP;
  const z = Math.round(camera.position.z / FOLLOW_STEP) * FOLLOW_STEP;
  // Nothing to draw until clouds are somewhere within reach.
  const visible = Math.max(cloudCover(-z), cloudCover(-z + 25_000), cloudCover(-z - 25_000)) > 0.01;
  // Draw the farther layer first, so the nearer one lies over it.
  const fromBelow = camera.position.y < (CLOUD_LAYERS[0] + CLOUD_LAYERS[1]) / 2;
  layers.meshes.forEach((mesh, index) => {
    mesh.visible = visible;
    mesh.renderOrder = 10 + (fromBelow ? 1 - index : index);
    mesh.position.x = x;
    mesh.position.z = z;
    mesh.updateMatrix();
    const uniforms = layers.uniforms[index];
    if (uniforms) updateLightingUniforms(uniforms, atmosphere);
  });
}

/** Two cloud layers: a deck that thickens toward the end of the flight. */
export function Clouds() {
  const layers = useMemo<CloudLayers>(() => {
    const geometry = new THREE.PlaneGeometry(LAYER_SIZE, LAYER_SIZE).rotateX(-Math.PI / 2);
    const uniforms: LightingUniforms[] = [];
    const materials: THREE.ShaderMaterial[] = [];
    const meshes = CLOUD_LAYERS.map((height, index) => {
      const layerUniforms = createLightingUniforms();
      uniforms.push(layerUniforms);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          ...(layerUniforms as unknown as Record<string, THREE.IUniform>),
          uLayer: { value: index },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      materials.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = height;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      return mesh;
    });
    return { meshes, materials, uniforms, geometry };
  }, []);

  useEffect(
    () => () => {
      layers.geometry.dispose();
      for (const material of layers.materials) material.dispose();
    },
    [layers],
  );

  useFrame(({ camera }) => updateClouds(layers, camera));

  return (
    <group>
      {layers.meshes.map((mesh, index) => (
        <primitive key={index} object={mesh} />
      ))}
    </group>
  );
}
