import * as THREE from "three";
import type { Atmosphere } from "@/flight/atmosphere";

/** Uniforms declared by LIGHTING_UNIFORMS in shaders/lighting.glsl.ts. */
export interface LightingUniforms {
  uSunDirection: THREE.IUniform<THREE.Vector3>;
  uSunColor: THREE.IUniform<THREE.Color>;
  uSunIntensity: THREE.IUniform<number>;
  uAmbientSky: THREE.IUniform<THREE.Color>;
  uAmbientGround: THREE.IUniform<THREE.Color>;
  uAmbientIntensity: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
  uGlow: THREE.IUniform<THREE.Color>;
  uGlowStrength: THREE.IUniform<number>;
}

export function createLightingUniforms(): LightingUniforms {
  return {
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 1 },
    uAmbientSky: { value: new THREE.Color(1, 1, 1) },
    uAmbientGround: { value: new THREE.Color(0, 0, 0) },
    uAmbientIntensity: { value: 1 },
    uFogColor: { value: new THREE.Color(0, 0, 0) },
    uFogDensity: { value: 0 },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uGlowStrength: { value: 0 },
  };
}

/**
 * Lowest the light direction may point. Before sunrise the sun is below the
 * horizon; surfaces must never be lit from underneath.
 */
export const MIN_LIGHT_HEIGHT = 0.03;

/** Copies the frame's atmosphere into a shader's lighting uniforms. */
export function updateLightingUniforms(uniforms: LightingUniforms, atmosphere: Atmosphere): void {
  const [sx, sy, sz] = atmosphere.sunDirection;
  uniforms.uSunDirection.value.set(sx, Math.max(sy, MIN_LIGHT_HEIGHT), sz).normalize();
  uniforms.uSunColor.value.setRGB(...atmosphere.sunColor);
  uniforms.uSunIntensity.value = atmosphere.sunIntensity;
  uniforms.uAmbientSky.value.setRGB(...atmosphere.ambientSky);
  uniforms.uAmbientGround.value.setRGB(...atmosphere.ambientGround);
  uniforms.uAmbientIntensity.value = atmosphere.ambientIntensity;
  uniforms.uFogColor.value.setRGB(...atmosphere.fogColor);
  uniforms.uFogDensity.value = atmosphere.fogDensity;
  uniforms.uGlow.value.setRGB(...atmosphere.glow);
  uniforms.uGlowStrength.value = atmosphere.glowStrength;
}
