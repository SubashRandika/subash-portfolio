/**
 * The flight path: where the aircraft is and how it is oriented for any
 * progress value.
 *
 * Everything here is a pure function of `progress` (0–1). Nothing is
 * integrated over time, which is what makes the flight exactly reversible:
 * scrolling back to a progress value always reproduces the same pose.
 *
 * World axes (metres): +Y up, the route runs toward -Z, +X is to the right
 * of the direction of travel. The runway centreline is the Z axis and the
 * aircraft starts at the origin.
 */

import { type Keyframe, clamp, createTrack, DEG, smootherstep, smoothstep } from "./math";

// ---------------------------------------------------------------------------
// Distance along the route
// ---------------------------------------------------------------------------

/** Route distance covered per unit of progress once at cruise speed. */
export const CRUISE_METRES_PER_PROGRESS = 52_000;

/** The aircraft holds on the runway until this progress, then accelerates. */
export const ROLL_START = 0.02;
/** Progress at which it has reached cruise speed along the route. */
export const ROLL_END = 0.075;
/** Progress at which the wheels leave the runway. */
export const LIFTOFF = 0.058;

/**
 * Distance travelled along the route, in metres. Speed eases from zero to
 * cruise between ROLL_START and ROLL_END (the integral of a smoothstep), then
 * stays constant.
 */
export function routeDistance(progress: number): number {
  const p = clamp(progress, 0, 1);
  const span = ROLL_END - ROLL_START;
  if (p <= ROLL_START) return 0;
  if (p < ROLL_END) {
    const t = (p - ROLL_START) / span;
    return CRUISE_METRES_PER_PROGRESS * span * (t * t * t - (t * t * t * t) / 2);
  }
  return CRUISE_METRES_PER_PROGRESS * (span / 2 + (p - ROLL_END));
}

/** Route speed as a fraction of cruise speed, 0–1. */
export function routeSpeed(progress: number): number {
  return smoothstep(ROLL_START, ROLL_END, progress);
}

export const ROUTE_LENGTH = routeDistance(1);

// ---------------------------------------------------------------------------
// Lateral meander
// ---------------------------------------------------------------------------

/** The route is dead straight until the aircraft is clear of the airport. */
const MEANDER_FROM = 3_600;
const MEANDER_FULL = 7_800;

const WAVE_A = { amplitude: 1_350, length: 11_200, phase: 0.6 };
const WAVE_B = { amplitude: 250, length: 6_300, phase: 2.1 };

const TAU = Math.PI * 2;

/** Sideways offset of the route at a given distance, in metres. */
export function routeLateral(distance: number): number {
  // smootherstep keeps curvature (and therefore bank) continuous where the
  // meander fades in.
  const envelope = smootherstep(MEANDER_FROM, MEANDER_FULL, distance);
  if (envelope === 0) return 0;
  return (
    envelope *
    (WAVE_A.amplitude * Math.sin((TAU * distance) / WAVE_A.length + WAVE_A.phase) +
      WAVE_B.amplitude * Math.sin((TAU * distance) / WAVE_B.length + WAVE_B.phase))
  );
}

const DERIVATIVE_STEP = 4;

/** Slope of the meander: metres sideways per metre forward. */
export function routeLateralSlope(distance: number): number {
  return (
    (routeLateral(distance + DERIVATIVE_STEP) - routeLateral(distance - DERIVATIVE_STEP)) /
    (2 * DERIVATIVE_STEP)
  );
}

/** Signed curvature of the route in plan view (1 / turn radius). */
export function routeCurvature(distance: number): number {
  const h = 12;
  const second =
    (routeLateral(distance + h) - 2 * routeLateral(distance) + routeLateral(distance - h)) / (h * h);
  const slope = routeLateralSlope(distance);
  return second / Math.pow(1 + slope * slope, 1.5);
}

// ---------------------------------------------------------------------------
// Vertical profile
// ---------------------------------------------------------------------------

/** Height of the wheels above the runway elevation, in metres. */
const ALTITUDE_KEYS: readonly Keyframe[] = [
  [0, 0],
  [LIFTOFF, 0],
  [0.066, 7],
  [0.08, 95],
  [0.11, 330],
  [0.16, 560],
  [0.22, 760],
  [0.3, 980],
  [0.38, 720],
  [0.445, 470],
  [0.51, 880],
  [0.58, 1_500],
  [0.65, 900],
  [0.72, 520],
  [0.8, 640],
  [0.84, 950],
  [0.88, 1_500],
  [0.92, 2_050],
  [0.96, 2_450],
  [1, 2_650],
];

export const routeAltitude = createTrack(ALTITUDE_KEYS);

/**
 * Nose-up attitude added on top of the climb angle, in degrees. This is what
 * produces the takeoff rotation: the nose lifts while the main wheels are
 * still on the runway.
 */
const ATTITUDE_KEYS: readonly Keyframe[] = [
  [0, 0],
  [0.049, 0],
  [0.06, 8.5],
  [0.076, 7],
  [0.12, 3.2],
  [0.2, 2.4],
  [1, 2.2],
];

const attitudeOffset = createTrack(ATTITUDE_KEYS);

// ---------------------------------------------------------------------------
// Pose
// ---------------------------------------------------------------------------

/**
 * Converts turn curvature to bank: tan(bank) = v² · κ / g for a coordinated
 * turn. The speed used is chosen for how the turns should read on screen.
 */
const BANK_SPEED = 92;
const GRAVITY = 9.81;
const MAX_BANK = 32 * DEG;

export interface FlightPose {
  /** World position of the point on the ground under the main gear. */
  x: number;
  y: number;
  z: number;
  /** Heading as a rotation about +Y. π means flying toward -Z. */
  yaw: number;
  /** Nose-up angle in radians. */
  pitch: number;
  /** Bank in radians. Positive lowers the right wing (a right turn). */
  roll: number;
  /** Distance travelled along the route, in metres. */
  distance: number;
  /** Route speed as a fraction of cruise, 0–1. */
  speed: number;
  /** Landing gear extension: 1 down, 0 retracted. */
  gear: number;
  /** Engine thrust, 0–1. */
  throttle: number;
  /** Landing light level, 0–1. */
  landingLights: number;
  /** True once the wheels have left the runway. */
  airborne: boolean;
}

export function createFlightPose(): FlightPose {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: Math.PI,
    pitch: 0,
    roll: 0,
    distance: 0,
    speed: 0,
    gear: 1,
    throttle: 0.15,
    landingLights: 1,
    airborne: false,
  };
}

const THROTTLE_KEYS: readonly Keyframe[] = [
  [0, 0.15],
  [0.016, 0.15],
  [0.028, 1],
  [0.12, 1],
  [0.18, 0.72],
  [1, 0.72],
];
const throttleAt = createTrack(THROTTLE_KEYS);

/** Progress step used to measure the climb angle. */
const PITCH_STEP = 0.0015;

/**
 * Fills `out` with the aircraft pose at `progress` and returns it.
 * Reuses the object so the render loop allocates nothing.
 */
export function flightPose(progress: number, out: FlightPose): FlightPose {
  const p = clamp(progress, 0, 1);
  const distance = routeDistance(p);
  const altitude = routeAltitude(p);
  const airborne = p > LIFTOFF;

  out.distance = distance;
  out.x = routeLateral(distance);
  out.y = altitude;
  out.z = -distance;
  out.speed = routeSpeed(p);
  out.airborne = airborne;

  // Heading follows the route in plan view.
  // Written as π − atan(slope) rather than atan2 so the heading stays
  // continuous through due "north" instead of wrapping between +π and −π.
  out.yaw = Math.PI - Math.atan(routeLateralSlope(distance));

  // Climb angle from the vertical profile, measured over a short span.
  const p0 = Math.max(0, p - PITCH_STEP);
  const p1 = Math.min(1, p + PITCH_STEP);
  const run = routeDistance(p1) - routeDistance(p0);
  const rise = routeAltitude(p1) - routeAltitude(p0);
  const climb = run > 0.01 ? Math.atan2(rise, run) : 0;
  out.pitch = climb + attitudeOffset(p) * DEG;

  // Bank into turns once flying; wings level on the ground.
  const bank = Math.atan((BANK_SPEED * BANK_SPEED * routeCurvature(distance)) / GRAVITY);
  const settle = smoothstep(LIFTOFF, LIFTOFF + 0.03, p);
  out.roll = clamp(bank, -MAX_BANK, MAX_BANK) * settle;

  out.gear = 1 - smoothstep(0.068, 0.094, p);
  out.throttle = throttleAt(p);
  out.landingLights = 1 - smoothstep(0.1, 0.135, p);

  return out;
}
