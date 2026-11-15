/**
 * The state of the current frame.
 *
 * The flight controller fills this once per frame, before anything else
 * runs. Sky, lights, environments and the aircraft read from it instead of
 * each recomputing the pose or atmosphere. It is a plain mutable object on
 * purpose: per-frame values must not go through React.
 */

import { type Atmosphere, createAtmosphere } from "./atmosphere";
import { type FlightPose, createFlightPose } from "./path";
import { type CameraPose, createCameraPose } from "./shots";

export interface FlightFrame {
  /** Smoothed flight progress this frame was computed for. */
  progress: number;
  pose: FlightPose;
  camera: CameraPose;
  atmosphere: Atmosphere;
  /** Seconds since the scene started, for ambient motion only. */
  time: number;
  /** Increments whenever progress changed since the previous frame. */
  revision: number;
}

export const flightFrame: FlightFrame = {
  progress: 0,
  pose: createFlightPose(),
  camera: createCameraPose(),
  atmosphere: createAtmosphere(),
  time: 0,
  revision: 0,
};
