/**
 * Sky, sun, ambient light and haze as a function of flight progress.
 *
 * Each "look" is an art-directed state at one point of the flight. Every
 * numeric field is interpolated with monotone curves, so light changes are
 * gradual and identical in both scroll directions. Colours are stored in
 * linear RGB, ready for shaders and Three.js lights.
 */

import { type Keyframe, clamp, createTrack, DEG } from "./math";

export type RGB = readonly [r: number, g: number, b: number];

function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Converts "#rrggbb" to linear RGB. */
export function hex(value: string): RGB {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) throw new Error(`Expected a #rrggbb colour, received "${value}".`);
  const n = Number.parseInt(match[1]!, 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}

interface Look {
  at: number;
  name: string;
  /** Degrees right of the direction of travel. */
  sunAzimuth: number;
  /** Degrees above the horizon. Negative before sunrise. */
  sunElevation: number;
  zenith: RGB;
  horizon: RGB;
  /** Colour of the glow around the sun's position on the horizon. */
  glow: RGB;
  glowStrength: number;
  sunColor: RGB;
  /** Direct light intensity. */
  sunIntensity: number;
  ambientSky: RGB;
  ambientGround: RGB;
  ambientIntensity: number;
  fogColor: RGB;
  /** Exponential-squared fog density, per metre. */
  fogDensity: number;
  exposure: number;
  /** Star visibility, 0–1. */
  stars: number;
  /** Brightness of runway and aircraft light glows, 0–1. */
  lamps: number;
}

const LOOKS: readonly Look[] = [
  {
    at: 0,
    name: "pre-dawn",
    sunAzimuth: 24,
    sunElevation: -3.6,
    zenith: hex("#040812"),
    horizon: hex("#222c4a"),
    glow: hex("#f08446"),
    glowStrength: 1,
    sunColor: hex("#ff9a5c"),
    sunIntensity: 0.5,
    ambientSky: hex("#6f88c4"),
    ambientGround: hex("#16181f"),
    ambientIntensity: 0.85,
    fogColor: hex("#222b45"),
    fogDensity: 0.00046,
    exposure: 1.15,
    stars: 0.85,
    lamps: 1,
  },
  {
    at: 0.045,
    name: "first light",
    sunAzimuth: 24,
    sunElevation: 0.2,
    zenith: hex("#0a1631"),
    horizon: hex("#39446a"),
    glow: hex("#f58f4f"),
    glowStrength: 1,
    sunColor: hex("#ff9d5c"),
    sunIntensity: 0.9,
    ambientSky: hex("#6f88bd"),
    ambientGround: hex("#1c1d22"),
    ambientIntensity: 0.9,
    fogColor: hex("#2c3350"),
    fogDensity: 0.0004,
    exposure: 1.1,
    stars: 0.45,
    lamps: 1,
  },
  {
    at: 0.085,
    name: "sunrise",
    sunAzimuth: 25,
    sunElevation: 3.8,
    zenith: hex("#15305e"),
    horizon: hex("#8d8193"),
    glow: hex("#ffa35e"),
    glowStrength: 0.9,
    sunColor: hex("#ffb07a"),
    sunIntensity: 1.7,
    ambientSky: hex("#7f9bcc"),
    ambientGround: hex("#2a2622"),
    ambientIntensity: 0.72,
    fogColor: hex("#6f6c7e"),
    fogDensity: 0.00024,
    exposure: 1.02,
    stars: 0,
    lamps: 0.85,
  },
  {
    at: 0.15,
    name: "early morning",
    sunAzimuth: 30,
    sunElevation: 11,
    zenith: hex("#235091"),
    horizon: hex("#cfbba9"),
    glow: hex("#ffc48f"),
    glowStrength: 0.55,
    sunColor: hex("#ffd2a6"),
    sunIntensity: 2.6,
    ambientSky: hex("#8fb0dd"),
    ambientGround: hex("#3a352c"),
    ambientIntensity: 0.9,
    fogColor: hex("#bbb0a8"),
    fogDensity: 0.00012,
    exposure: 1,
    stars: 0,
    lamps: 0.45,
  },
  {
    at: 0.22,
    name: "morning",
    sunAzimuth: 38,
    sunElevation: 22,
    zenith: hex("#2a62ad"),
    horizon: hex("#c9d6de"),
    glow: hex("#ffe2c0"),
    glowStrength: 0.26,
    sunColor: hex("#fff0dc"),
    sunIntensity: 3,
    ambientSky: hex("#9dbde6"),
    ambientGround: hex("#3d3a30"),
    ambientIntensity: 1,
    fogColor: hex("#bccbd6"),
    fogDensity: 0.00007,
    exposure: 1,
    stars: 0,
    lamps: 0.2,
  },
  {
    at: 0.45,
    name: "day",
    sunAzimuth: 55,
    sunElevation: 44,
    zenith: hex("#2c68b8"),
    horizon: hex("#c3d6e4"),
    glow: hex("#fff1dc"),
    glowStrength: 0.12,
    sunColor: hex("#fff7ea"),
    sunIntensity: 3.2,
    ambientSky: hex("#a3c2ea"),
    ambientGround: hex("#403d33"),
    ambientIntensity: 1.05,
    fogColor: hex("#bdcfdd"),
    fogDensity: 0.000065,
    exposure: 1,
    stars: 0,
    lamps: 0.12,
  },
  {
    at: 0.8,
    name: "afternoon",
    sunAzimuth: 40,
    sunElevation: 34,
    zenith: hex("#2b64b2"),
    horizon: hex("#c9d8e2"),
    glow: hex("#fff0d8"),
    glowStrength: 0.16,
    sunColor: hex("#fff3e2"),
    sunIntensity: 3.1,
    ambientSky: hex("#a0bfe8"),
    ambientGround: hex("#403d33"),
    ambientIntensity: 1.02,
    fogColor: hex("#c2d2de"),
    fogDensity: 0.000065,
    exposure: 1,
    stars: 0,
    lamps: 0.12,
  },
  {
    at: 0.9,
    name: "golden",
    sunAzimuth: 14,
    sunElevation: 9,
    zenith: hex("#24518f"),
    horizon: hex("#f0c79c"),
    glow: hex("#ffb878"),
    glowStrength: 0.8,
    sunColor: hex("#ffc58e"),
    sunIntensity: 2.6,
    ambientSky: hex("#94b0db"),
    ambientGround: hex("#6c6258"),
    ambientIntensity: 0.95,
    fogColor: hex("#e6c4a2"),
    fogDensity: 0.00006,
    exposure: 1,
    stars: 0,
    lamps: 0.4,
  },
  {
    at: 1,
    name: "sunrise horizon",
    sunAzimuth: 8,
    sunElevation: 5,
    zenith: hex("#1c3f7a"),
    horizon: hex("#f4b47a"),
    glow: hex("#ffa565"),
    glowStrength: 1,
    sunColor: hex("#ffb37a"),
    sunIntensity: 2.2,
    ambientSky: hex("#8aa6d4"),
    ambientGround: hex("#7a6a5c"),
    ambientIntensity: 0.9,
    fogColor: hex("#eab892"),
    fogDensity: 0.00006,
    exposure: 1,
    stars: 0,
    lamps: 0.55,
  },
];

/** The interpolated state handed to the renderer. Colours are linear RGB. */
export interface Atmosphere {
  /** Unit vector pointing from the scene toward the sun. */
  sunDirection: [number, number, number];
  sunElevation: number;
  zenith: [number, number, number];
  horizon: [number, number, number];
  glow: [number, number, number];
  glowStrength: number;
  sunColor: [number, number, number];
  sunIntensity: number;
  ambientSky: [number, number, number];
  ambientGround: [number, number, number];
  ambientIntensity: number;
  fogColor: [number, number, number];
  fogDensity: number;
  exposure: number;
  stars: number;
  lamps: number;
}

export function createAtmosphere(): Atmosphere {
  return {
    sunDirection: [0, 1, 0],
    sunElevation: 45,
    zenith: [0, 0, 0],
    horizon: [0, 0, 0],
    glow: [0, 0, 0],
    glowStrength: 0,
    sunColor: [1, 1, 1],
    sunIntensity: 1,
    ambientSky: [1, 1, 1],
    ambientGround: [0, 0, 0],
    ambientIntensity: 1,
    fogColor: [0, 0, 0],
    fogDensity: 0,
    exposure: 1,
    stars: 0,
    lamps: 0,
  };
}

type Track = (progress: number) => number;

type ScalarField = {
  [K in keyof Look]: Look[K] extends number ? K : never;
}[keyof Look];

type ColorField = {
  [K in keyof Look]: Look[K] extends RGB ? K : never;
}[keyof Look];

function scalarTrack(field: Exclude<ScalarField, "at">): Track {
  return createTrack(LOOKS.map((look): Keyframe => [look.at, look[field]]));
}

function colorTracks(field: ColorField): [Track, Track, Track] {
  return [0, 1, 2].map((channel) =>
    createTrack(LOOKS.map((look): Keyframe => [look.at, look[field][channel]!])),
  ) as [Track, Track, Track];
}

const SCALARS = {
  sunAzimuth: scalarTrack("sunAzimuth"),
  sunElevation: scalarTrack("sunElevation"),
  glowStrength: scalarTrack("glowStrength"),
  sunIntensity: scalarTrack("sunIntensity"),
  ambientIntensity: scalarTrack("ambientIntensity"),
  fogDensity: scalarTrack("fogDensity"),
  exposure: scalarTrack("exposure"),
  stars: scalarTrack("stars"),
  lamps: scalarTrack("lamps"),
};

const COLORS = {
  zenith: colorTracks("zenith"),
  horizon: colorTracks("horizon"),
  glow: colorTracks("glow"),
  sunColor: colorTracks("sunColor"),
  ambientSky: colorTracks("ambientSky"),
  ambientGround: colorTracks("ambientGround"),
  fogColor: colorTracks("fogColor"),
};

const COLOR_FIELDS = Object.keys(COLORS) as (keyof typeof COLORS)[];

/** Fills `out` with the atmosphere at `progress` and returns it. */
export function atmosphereAt(progress: number, out: Atmosphere): Atmosphere {
  const p = clamp(progress, 0, 1);

  const azimuth = SCALARS.sunAzimuth(p) * DEG;
  const elevationDeg = SCALARS.sunElevation(p);
  const elevation = elevationDeg * DEG;
  // The route runs toward -Z, so azimuth 0 puts the sun dead ahead.
  out.sunDirection[0] = Math.sin(azimuth) * Math.cos(elevation);
  out.sunDirection[1] = Math.sin(elevation);
  out.sunDirection[2] = -Math.cos(azimuth) * Math.cos(elevation);
  out.sunElevation = elevationDeg;

  for (const field of COLOR_FIELDS) {
    const tracks = COLORS[field];
    const target = out[field];
    target[0] = tracks[0](p);
    target[1] = tracks[1](p);
    target[2] = tracks[2](p);
  }

  out.glowStrength = SCALARS.glowStrength(p);
  out.sunIntensity = SCALARS.sunIntensity(p);
  out.ambientIntensity = SCALARS.ambientIntensity(p);
  out.fogDensity = SCALARS.fogDensity(p);
  out.exposure = SCALARS.exposure(p);
  out.stars = SCALARS.stars(p);
  out.lamps = SCALARS.lamps(p);
  return out;
}

/** Name of the most recent look at `progress`, for debugging. */
export function lookNameAt(progress: number): string {
  let name = LOOKS[0]!.name;
  for (const look of LOOKS) {
    if (look.at <= progress) name = look.name;
  }
  return name;
}
