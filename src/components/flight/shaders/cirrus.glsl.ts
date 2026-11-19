/**
 * Thin, high cirrus painted into the sky dome, and read again by the stars
 * so they dim behind it. Value noise in four fixed octaves (cheap to compile
 * on Direct3D), projected onto a high cloud deck so wisps foreshorten toward
 * the horizon, stretched along the wind into streaks and drifted slowly.
 */
export const CIRRUS_GLSL = /* glsl */ `
  float cirrusHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float cirrusNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(cirrusHash(i), cirrusHash(i + vec2(1.0, 0.0)), u.x),
      mix(cirrusHash(i + vec2(0.0, 1.0)), cirrusHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Density 0–1 of cirrus in direction dir; cover 0–1 from the atmosphere.
  float cirrusDensity(vec3 dir, float time, float cover) {
    if (cover <= 0.001 || dir.y <= 0.0) return 0.0;
    // Onto a high deck: the same wisp spans less sky the lower it sits.
    vec2 p = dir.xz / (dir.y + 0.1) * 1.5;
    // Wind: a slow drift, mostly across the route.
    p += vec2(0.034, -0.012) * time;
    // Streaks: squeeze across the wind, stretch along it.
    vec2 q = vec2(p.x * 0.42 + p.y * 0.18, p.y * 1.7 - p.x * 0.26);
    float n = 0.5 * cirrusNoise(q);
    // The finer octaves move a little on their own, so wisps slowly change
    // shape as well as position.
    q = q * 2.03 + vec2(1.7, 9.2) + vec2(0.021, 0.008) * time;
    n += 0.25 * cirrusNoise(q);
    q = q * 2.01 + vec2(8.3, 2.8) - vec2(0.012, 0.017) * time;
    n += 0.125 * cirrusNoise(q);
    q = q * 2.02 + vec2(4.1, 6.1);
    n += 0.0625 * cirrusNoise(q);
    float density = smoothstep(0.6 - cover * 0.16, 0.9 - cover * 0.08, n);
    // Thin out into the haze on the horizon.
    return density * smoothstep(0.012, 0.14, dir.y);
  }
`;
