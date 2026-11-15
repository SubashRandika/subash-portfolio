/**
 * Camera choreography.
 *
 * A shot places the camera on a sphere around the aircraft, in a frame that
 * follows the route's heading (not the aircraft's pitch or bank, which would
 * make the view lurch). Shots are keyed to flight progress and interpolated
 * with monotone curves, so the camera path is smooth, never overshoots a
 * framing, and is identical in both scroll directions.
 */

import { AIRCRAFT_CENTRELINE_Y } from "./aircraft";
import { type Keyframe, clamp, createTrack, DEG, smoothstep } from "./math";
import { type FlightPose, routeDistance, routeLateral } from "./path";

export interface Shot {
  /** Degrees around the aircraft. 0 is directly behind, 90 is off the right wing, 180 is ahead. */
  azimuth: number;
  /** Degrees above the aircraft's level. 90 looks straight down. */
  elevation: number;
  /** Metres from the aircraft. */
  distance: number;
  /** Metres ahead of the aircraft that the camera aims at. */
  ahead: number;
  /** Metres above the fuselage centreline that the camera aims at. */
  lift: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** How much of the aircraft's bank the camera shares, 0–1. */
  bankFollow: number;
  /**
   * Where the aircraft sits in a landscape frame, as a fraction of the frame
   * width from centre. Positive moves it right, leaving the left for text.
   */
  frameX: number;
}

export interface ShotKey extends Shot {
  /** Flight progress at which this framing is reached. */
  at: number;
  /** Name of the framing, for documentation and debugging. */
  name: string;
}

/**
 * The shot list. Phase 03 covers the opening, takeoff and climb-out with the
 * rear chase and side tracking cameras; later chapters hold the chase view
 * until their choreography is added.
 */
export const SHOT_KEYS: readonly ShotKey[] = [
  { at: 0, name: "establishing", azimuth: -35, elevation: 3.4, distance: 46, ahead: 5, lift: 0.6, fov: 30, bankFollow: 0, frameX: 0.15 },
  { at: 0.022, name: "approach", azimuth: -22, elevation: 4, distance: 36, ahead: 6, lift: 0.6, fov: 32, bankFollow: 0, frameX: 0.16 },
  { at: 0.045, name: "rear chase", azimuth: 0, elevation: 8, distance: 27, ahead: 10, lift: 1, fov: 40, bankFollow: 0, frameX: 0.17 },
  { at: 0.058, name: "rotation", azimuth: 8, elevation: 6, distance: 29, ahead: 9, lift: 1, fov: 42, bankFollow: 0.1, frameX: 0.17 },
  { at: 0.072, name: "liftoff", azimuth: 55, elevation: 2.5, distance: 34, ahead: 3, lift: 0.5, fov: 36, bankFollow: 0.1, frameX: 0.16 },
  { at: 0.09, name: "side tracking", azimuth: 82, elevation: 2, distance: 38, ahead: 1, lift: 0.5, fov: 33, bankFollow: 0.1, frameX: 0.14 },
  { at: 0.125, name: "climb-out", azimuth: 38, elevation: 9, distance: 42, ahead: 6, lift: 1, fov: 40, bankFollow: 0.2, frameX: 0.17 },
  { at: 0.165, name: "rear chase", azimuth: 0, elevation: 11, distance: 36, ahead: 12, lift: 2, fov: 44, bankFollow: 0.3, frameX: 0.17 },
  { at: 1, name: "rear chase", azimuth: 0, elevation: 11, distance: 36, ahead: 12, lift: 2, fov: 44, bankFollow: 0.3, frameX: 0.17 },
];

type ShotParameter = keyof Shot;

const PARAMETERS: readonly ShotParameter[] = [
  "azimuth",
  "elevation",
  "distance",
  "ahead",
  "lift",
  "fov",
  "bankFollow",
  "frameX",
];

function buildTracks(keys: readonly ShotKey[]): Record<ShotParameter, (p: number) => number> {
  const tracks = {} as Record<ShotParameter, (p: number) => number>;
  for (const parameter of PARAMETERS) {
    tracks[parameter] = createTrack(keys.map((key): Keyframe => [key.at, key[parameter]]));
  }
  return tracks;
}

const TRACKS = buildTracks(SHOT_KEYS);

export function createShot(): Shot {
  return {
    azimuth: 0,
    elevation: 0,
    distance: 30,
    ahead: 0,
    lift: 0,
    fov: 40,
    bankFollow: 0,
    frameX: 0,
  };
}

/** Interpolated shot parameters at `progress`. */
export function shotAt(progress: number, out: Shot): Shot {
  const p = clamp(progress, 0, 1);
  for (const parameter of PARAMETERS) out[parameter] = TRACKS[parameter](p);
  return out;
}

/** Name of the most recent shot key at `progress`. */
export function shotNameAt(progress: number): string {
  let name = SHOT_KEYS[0]!.name;
  for (const key of SHOT_KEYS) {
    if (key.at <= progress) name = key.name;
  }
  return name;
}

/** Half-width, in metres of route, over which the camera's heading is averaged. */
const HEADING_WINDOW = 320;

/**
 * Heading of the route averaged over a stretch of it. The camera uses this
 * instead of the aircraft's instantaneous heading so it swings through turns
 * smoothly.
 */
export function cameraHeading(distance: number): number {
  const slope =
    (routeLateral(distance + HEADING_WINDOW) - routeLateral(distance - HEADING_WINDOW)) /
    (2 * HEADING_WINDOW);
  // Continuous through due "north": see flightPose.
  return Math.PI - Math.atan(slope);
}

export interface CameraPose {
  /** Camera position. */
  px: number;
  py: number;
  pz: number;
  /** Point the camera aims at. */
  tx: number;
  ty: number;
  tz: number;
  /** Up vector for the look-at. */
  ux: number;
  uy: number;
  uz: number;
  /** Vertical field of view in degrees. */
  fov: number;
  /** Extra roll about the view axis, in radians. */
  roll: number;
  /** Horizontal framing offset for landscape frames; see Shot.frameX. */
  frameX: number;
}

export function createCameraPose(): CameraPose {
  return {
    px: 0,
    py: 5,
    pz: 30,
    tx: 0,
    ty: 2,
    tz: 0,
    ux: 0,
    uy: 1,
    uz: 0,
    fov: 40,
    roll: 0,
    frameX: 0,
  };
}

const scratchShot = createShot();

/** Lowest the camera may sit above the ground directly beneath it. */
const MIN_CAMERA_CLEARANCE = 1.1;

/**
 * Camera placement for a given progress and aircraft pose.
 *
 * @param groundHeight  elevation of the ground under the camera, used to keep
 *                      the camera from dipping below the surface.
 */
export function cameraPose(
  progress: number,
  pose: FlightPose,
  out: CameraPose,
  groundHeight = 0,
): CameraPose {
  const shot = shotAt(progress, scratchShot);
  const heading = cameraHeading(routeDistance(progress));

  // Route-aligned frame: forward along the route, right of travel, world up.
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -fz;
  const rz = fx;

  const originX = pose.x;
  const originY = pose.y + AIRCRAFT_CENTRELINE_Y;
  const originZ = pose.z;

  const azimuth = shot.azimuth * DEG;
  const elevation = shot.elevation * DEG;
  const horizontal = shot.distance * Math.cos(elevation);
  const dirX = -fx * Math.cos(azimuth) + rx * Math.sin(azimuth);
  const dirZ = -fz * Math.cos(azimuth) + rz * Math.sin(azimuth);

  out.px = originX + dirX * horizontal;
  out.py = Math.max(
    originY + shot.distance * Math.sin(elevation),
    groundHeight + MIN_CAMERA_CLEARANCE,
  );
  out.pz = originZ + dirZ * horizontal;

  out.tx = originX + fx * shot.ahead;
  out.ty = originY + shot.lift;
  out.tz = originZ + fz * shot.ahead;

  // Looking straight down has no meaningful "world up", so the up vector
  // turns toward the direction of travel as the camera rises overhead. The
  // aircraft then flies up the screen, as on a map.
  const overhead = smoothstep(62, 86, shot.elevation);
  const ux = fx * overhead;
  const uy = 1 - overhead;
  const uz = fz * overhead;
  const length = Math.hypot(ux, uy, uz) || 1;
  out.ux = ux / length;
  out.uy = uy / length;
  out.uz = uz / length;

  out.fov = shot.fov;
  out.roll = -pose.roll * shot.bankFollow;
  out.frameX = shot.frameX;
  return out;
}
