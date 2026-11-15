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

/** The six kinds of framing the choreography is built from. */
export type CameraMode =
  | "establishing"
  | "rear chase"
  | "side tracking"
  | "high aerial"
  | "top-down"
  | "close-up";

export interface ShotKey extends Shot {
  /** Flight progress at which this framing is reached. */
  at: number;
  mode: CameraMode;
  /** What the shot is for, for documentation and debugging. */
  name: string;
}

/** Compact constructor so the shot list reads as a table. */
function shot(
  at: number,
  mode: CameraMode,
  name: string,
  azimuth: number,
  elevation: number,
  distance: number,
  ahead: number,
  lift: number,
  fov: number,
  bankFollow: number,
  frameX: number,
): ShotKey {
  return { at, mode, name, azimuth, elevation, distance, ahead, lift, fov, bankFollow, frameX };
}

/**
 * The shot list for the whole flight.
 *
 * Columns: progress, mode, purpose, azimuth, elevation, distance, aim ahead,
 * aim lift, field of view, bank follow, frame offset.
 *
 * Within a chapter the camera stays on one side of the aircraft and returns
 * to the rear chase between chapters, so it never swings through a
 * disorienting arc.
 */
export const SHOT_KEYS: readonly ShotKey[] = [
  // Opening and takeoff
  shot(0, "establishing", "parked at dawn", -35, 3.4, 46, 5, 0.6, 30, 0, 0.15),
  shot(0.022, "establishing", "approach", -22, 4, 36, 6, 0.6, 32, 0, 0.16),
  shot(0.045, "rear chase", "takeoff roll", 0, 8, 27, 10, 1, 40, 0, 0.17),
  shot(0.058, "rear chase", "rotation", 8, 6, 29, 9, 1, 42, 0.1, 0.17),
  shot(0.072, "side tracking", "liftoff", 55, 2.5, 34, 3, 0.5, 36, 0.1, 0.16),

  // Chapter 01: coast and countryside
  shot(0.09, "side tracking", "gear retraction", 82, 2, 38, 1, 0.5, 33, 0.1, 0.14),
  shot(0.125, "rear chase", "climb-out", 38, 9, 42, 6, 1, 40, 0.2, 0.17),
  shot(0.165, "rear chase", "over the coast", 0, 11, 36, 12, 2, 44, 0.3, 0.17),
  shot(0.2, "high aerial", "coastline", 16, 27, 74, 30, 0, 42, 0.15, 0.15),

  // Chapter 02: mountain valleys
  shot(0.235, "rear chase", "into the valley", 0, 9, 34, 14, 2, 46, 0.35, 0.17),
  shot(0.275, "close-up", "banking through the valley", 34, 5, 16, 3, 0.4, 32, 0.45, 0.16),
  shot(0.315, "side tracking", "ridge line", 80, 4, 42, 2, 0.5, 34, 0.15, 0.14),
  shot(0.355, "high aerial", "river valley", 24, 31, 88, 34, 0, 42, 0.1, 0.15),

  // Chapter 03: industrial region
  shot(0.395, "rear chase", "descending to the plain", 0, 13, 40, 16, 2, 44, 0.3, 0.17),
  shot(0.44, "side tracking", "past the works", -78, 7, 46, 2, 0.5, 34, 0.15, 0.14),
  shot(0.485, "high aerial", "logistics yards", -24, 37, 98, 36, 0, 42, 0.1, 0.15),

  // Chapter 04: mapped terrain
  shot(0.525, "high aerial", "climbing over the ridges", 0, 48, 115, 30, 0, 40, 0.05, 0.14),
  shot(0.565, "top-down", "map view", 0, 86, 190, 0, 0, 30, 0, 0.13),
  shot(0.605, "top-down", "map view", 0, 86, 200, 0, 0, 30, 0, 0.13),
  shot(0.64, "high aerial", "descending toward the city", 0, 30, 76, 28, 0, 42, 0.15, 0.15),

  // Chapter 05: the city
  shot(0.675, "rear chase", "along the river", 0, 10, 34, 14, 2, 46, 0.35, 0.17),
  shot(0.72, "side tracking", "skyline", -82, 3, 42, 1, 0.5, 33, 0.1, 0.14),
  shot(0.76, "close-up", "over the business district", -36, 6, 16, 3, 0.4, 32, 0.4, 0.16),
  shot(0.805, "high aerial", "bridges and parks", -18, 34, 92, 34, 0, 42, 0.1, 0.15),

  // Chapter 06: above the clouds
  shot(0.845, "rear chase", "climbing into cloud", 0, 8, 32, 14, 2, 46, 0.3, 0.17),
  shot(0.885, "side tracking", "breaking out on top", 80, 1.5, 40, 2, 0.5, 33, 0.1, 0.14),
  shot(0.925, "close-up", "toward the sunrise", 30, 4, 17, 4, 0.4, 32, 0.3, 0.16),
  shot(0.965, "establishing", "the journey continues", -16, 6, 96, 40, 2, 30, 0, 0.14),
  shot(1, "establishing", "the journey continues", -10, 7, 150, 60, 4, 28, 0, 0.12),
];

/** Mode of the most recent shot key at `progress`. */
export function cameraModeAt(progress: number): CameraMode {
  let mode = SHOT_KEYS[0]!.mode;
  for (const key of SHOT_KEYS) {
    if (key.at <= progress) mode = key.mode;
  }
  return mode;
}

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
