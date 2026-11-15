"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Atmosphere } from "@/flight/atmosphere";
import { flightFrame } from "@/flight/frame";
import { OUTPUT_CHUNKS } from "./shaders/lighting.glsl";

const vertexShader = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Pin the dome to the far plane so everything else draws in front of it.
    gl_Position.z = gl_Position.w;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uGlowStrength;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uSunDirection;
  uniform vec3 uGround;
  uniform float uStars;
  varying vec3 vDirection;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }

  void main() {
    vec3 dir = normalize(vDirection);
    float height = dir.y;
    float up = clamp(height, 0.0, 1.0);

    // Base gradient from horizon to zenith.
    vec3 color = mix(uHorizon, uZenith, pow(up, 0.42));

    // Warm band on the horizon, centred on the sun's bearing.
    vec2 flatDir = normalize(dir.xz + vec2(1e-5));
    vec2 flatSun = normalize(uSunDirection.xz + vec2(1e-5));
    float bearing = max(dot(flatDir, flatSun), 0.0);
    float lift = max(uSunDirection.y, 0.0) * 0.4;
    float band = exp(-abs(height - lift) * 24.0);
    float wide = exp(-abs(height - lift) * 7.0);
    color += uGlow * uGlowStrength * (pow(bearing, 2.5) * band * 0.95 + pow(bearing, 1.5) * wide * 0.16);

    // Halo and disc.
    float mu = max(dot(dir, uSunDirection), 0.0);
    float halo = pow(mu, 28.0) * 0.22 + pow(mu, 420.0) * 1.1;
    color += uSunColor * halo * uSunIntensity * 0.35;
    float disc = smoothstep(0.99992, 0.99997, mu) * smoothstep(-0.012, 0.004, height);
    color += uSunColor * disc * (2.0 + uSunIntensity * 6.0);

    // Stars before dawn, fading toward the horizon.
    if (uStars > 0.001 && height > 0.0) {
      vec3 cell = dir * 300.0;
      vec3 id = floor(cell);
      float seed = hash31(id);
      float point = smoothstep(0.42, 0.0, length(fract(cell) - 0.5));
      float star = step(0.9972, seed) * point * (0.35 + 0.65 * fract(seed * 173.3));
      color += vec3(0.85, 0.9, 1.0) * star * uStars * smoothstep(0.03, 0.3, height) * 1.6;
    }

    // Below the horizon: haze fading into ground tone (only seen in reflections).
    if (height < 0.0) {
      color = mix(color, uGround, smoothstep(0.0, -0.22, height));
    }

    gl_FragColor = vec4(color, 1.0);
    ${OUTPUT_CHUNKS}
  }
`;

interface SkyUniforms {
  [uniform: string]: THREE.IUniform;
  uZenith: THREE.IUniform<THREE.Color>;
  uHorizon: THREE.IUniform<THREE.Color>;
  uGlow: THREE.IUniform<THREE.Color>;
  uGlowStrength: THREE.IUniform<number>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunIntensity: THREE.IUniform<number>;
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uGround: THREE.IUniform<THREE.Color>;
  uStars: THREE.IUniform<number>;
}

function updateSky(uniforms: SkyUniforms, atmosphere: Atmosphere): void {
  uniforms.uZenith.value.setRGB(...atmosphere.zenith);
  uniforms.uHorizon.value.setRGB(...atmosphere.horizon);
  uniforms.uGlow.value.setRGB(...atmosphere.glow);
  uniforms.uGlowStrength.value = atmosphere.glowStrength;
  uniforms.uSunColor.value.setRGB(...atmosphere.sunColor);
  uniforms.uSunIntensity.value = atmosphere.sunIntensity;
  uniforms.uSunDirection.value.set(...atmosphere.sunDirection).normalize();
  // Reflections of the lower hemisphere read as hazy ground.
  uniforms.uGround.value
    .setRGB(...atmosphere.ambientGround)
    .lerp(_fog.setRGB(...atmosphere.fogColor), 0.55);
  uniforms.uStars.value = atmosphere.stars;
}

const _fog = new THREE.Color();

/** Everything the sky owns that must be created once and disposed. */
interface SkyResources {
  material: THREE.ShaderMaterial;
  uniforms: SkyUniforms;
  geometry: THREE.SphereGeometry;
  /** Off-screen copy of the dome used to capture reflections. */
  reflectionScene: THREE.Scene;
  cubeTarget: THREE.WebGLCubeRenderTarget;
  cubeCamera: THREE.CubeCamera;
  capturedRevision: number;
  framesSinceCapture: number;
  /** The scene whose environment this sky set, so it can be cleared again. */
  scene: THREE.Scene | null;
}

/** Stops a scene reflecting a cube map that is about to be disposed. */
function detachEnvironment(scene: THREE.Scene, texture: THREE.Texture): void {
  if (scene.environment === texture) scene.environment = null;
}

/** Captures the sky into the cube map and makes the scene reflect it. */
function captureReflection(res: SkyResources, gl: THREE.WebGLRenderer, scene: THREE.Scene): void {
  res.cubeCamera.update(gl, res.reflectionScene);
  res.cubeTarget.texture.needsPMREMUpdate = true;
  res.capturedRevision = flightFrame.revision;
  res.framesSinceCapture = 0;
  res.scene = scene;
  if (scene.environment !== res.cubeTarget.texture) scene.environment = res.cubeTarget.texture;
}

interface SkyProps {
  /** Radius of the dome; must sit inside the camera's far plane. */
  radius?: number;
  /** Edge length of the reflection cube map. 0 disables reflections. */
  reflectionSize?: number;
}

/** Frames to wait between reflection captures while the light is changing. */
const CAPTURE_INTERVAL = 10;

/**
 * The sky dome, sun and stars, plus the environment map the aircraft's paint
 * reflects. The reflection is re-captured from the same shader whenever the
 * light has changed, so reflections always match the sky on screen.
 */
export function Sky({ radius = 50_000, reflectionSize = 128 }: SkyProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const resources = useRef<SkyResources | null>(null);

  // Built once for rendering; the frame loop reaches it through the ref.
  const built = useMemo(() => {
    const uniforms: SkyUniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uGlowStrength: { value: 0 },
      uSunColor: { value: new THREE.Color() },
      uSunIntensity: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
      uGround: { value: new THREE.Color() },
      uStars: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false,
    });
    const geometry = new THREE.SphereGeometry(1, 48, 24);
    return { material, uniforms, geometry };
  }, []);

  useEffect(() => {
    const size = Math.max(0, reflectionSize);
    const cubeTarget = new THREE.WebGLCubeRenderTarget(Math.max(size, 16), {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
    });
    const cubeCamera = new THREE.CubeCamera(1, 100, cubeTarget);
    const reflectionScene = new THREE.Scene();
    const reflectionDome = new THREE.Mesh(built.geometry, built.material);
    reflectionDome.scale.setScalar(50);
    reflectionDome.frustumCulled = false;
    reflectionScene.add(reflectionDome);

    resources.current = {
      ...built,
      reflectionScene,
      cubeTarget,
      cubeCamera,
      capturedRevision: -1,
      framesSinceCapture: CAPTURE_INTERVAL,
      scene: null,
    };
    return () => {
      const scene = resources.current?.scene;
      if (scene) detachEnvironment(scene, cubeTarget.texture);
      resources.current = null;
      cubeTarget.dispose();
    };
  }, [built, reflectionSize]);

  useEffect(() => {
    return () => {
      built.material.dispose();
      built.geometry.dispose();
    };
  }, [built]);

  useFrame((state) => {
    const res = resources.current;
    if (!res) return;
    updateSky(res.uniforms, flightFrame.atmosphere);

    // Keep the dome centred on the camera so it never shows parallax.
    if (meshRef.current) meshRef.current.position.copy(state.camera.position);

    if (reflectionSize > 0) {
      res.framesSinceCapture++;
      const stale = res.capturedRevision !== flightFrame.revision;
      if (stale && res.framesSinceCapture >= CAPTURE_INTERVAL) {
        captureReflection(res, state.gl, state.scene);
      }
    }
  });

  return (
    <mesh
      ref={meshRef}
      geometry={built.geometry}
      material={built.material}
      scale={radius}
      frustumCulled={false}
      renderOrder={-1000}
    />
  );
}
