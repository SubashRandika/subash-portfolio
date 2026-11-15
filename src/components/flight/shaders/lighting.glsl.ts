/**
 * GLSL shared by the custom surface shaders (ground, runway, terrain).
 *
 * It mirrors how Three.js standard materials respond to the same directional
 * and hemisphere lights and to exponential-squared fog, so custom surfaces
 * and the aircraft sit in one consistent lighting model.
 */

export const LIGHTING_UNIFORMS = /* glsl */ `
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientSky;
  uniform vec3 uAmbientGround;
  uniform float uAmbientIntensity;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform vec3 uGlow;
  uniform float uGlowStrength;
`;

export const LIGHTING_FUNCTIONS = /* glsl */ `
  const float RECIPROCAL_PI_ = 0.3183098861837907;

  // Lambert diffuse under the sun plus hemisphere ambient.
  vec3 surfaceLight(vec3 albedo, vec3 normal) {
    float sun = max(dot(normal, uSunDirection), 0.0);
    vec3 direct = uSunColor * (uSunIntensity * sun);
    vec3 ambient = mix(uAmbientGround, uAmbientSky, normal.y * 0.5 + 0.5) * uAmbientIntensity;
    return albedo * RECIPROCAL_PI_ * (direct + ambient);
  }

  // Exponential-squared distance fog, matching THREE.FogExp2, with light
  // scattered in from the sun's bearing: haze glows where you look toward
  // the sun and stays cool elsewhere. toSurface runs from the camera to the
  // shaded point.
  vec3 applyFog(vec3 color, vec3 toSurface) {
    float viewDistance = length(toSurface);
    float factor = 1.0 - exp(-uFogDensity * uFogDensity * viewDistance * viewDistance);
    vec2 bearing = normalize(toSurface.xz + vec2(1e-5));
    vec2 sunBearing = normalize(uSunDirection.xz + vec2(1e-5));
    float toward = pow(max(dot(bearing, sunBearing), 0.0), 2.5);
    vec3 haze = uFogColor + uGlow * (uGlowStrength * toward * 0.9);
    return mix(color, haze, factor);
  }
`;

/** Value noise and fractal noise in the XZ plane. */
export const NOISE_FUNCTIONS = /* glsl */ `
  float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * valueNoise(p);
      p = p * 2.03 + vec2(17.3, 9.1);
      amplitude *= 0.5;
    }
    return value;
  }
`;

/** Ends every custom fragment shader: tone mapping then output encoding. */
export const OUTPUT_CHUNKS = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
