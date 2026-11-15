"use client";

import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import * as THREE from "three";
import type { AircraftRig } from "@/components/flight/Aircraft";
import type { AircraftState } from "@/flight/aircraft";
import { atmosphereAt } from "@/flight/atmosphere";
import { type FlightFrame, flightFrame } from "@/flight/frame";
import { damp, smoothstep } from "@/flight/math";
import { LIFTOFF, flightPose } from "@/flight/path";
import { type CameraPose, cameraPose } from "@/flight/shots";
import { commitFlightProgress, flightStore } from "@/flight/store";

/** How quickly drawn progress follows scroll. Higher is tighter. */
const RESPONSE = 5.5;

/**
 * A change in target larger than this is a jump (a chapter link, a restored
 * scroll position) rather than scrolling. The flight cuts to it instead of
 * racing through everything in between.
 */
const JUMP_THRESHOLD = 0.1;

const SETTLED = 1e-5;

/** Advances drawn progress toward the scroll target. Returns the new value. */
function advanceProgress(dt: number, first: boolean): number {
  const target = flightStore.target;
  const current = flightStore.progress;
  const gap = target - current;
  if (first || Math.abs(gap) > JUMP_THRESHOLD || Math.abs(gap) < SETTLED) return target;
  return damp(current, target, RESPONSE, dt);
}

/**
 * Places the aircraft. On top of the scroll-driven pose it adds small
 * time-based motion, so the aircraft still feels alive when scrolling stops:
 * engine vibration on the ground and a slow float once airborne. These never
 * accumulate, so they do not affect reversibility.
 */
function applyRig(rig: AircraftRig, frame: FlightFrame, state: AircraftState, still: boolean): void {
  const { pose, time } = frame;
  const airborne = smoothstep(LIFTOFF, LIFTOFF + 0.04, frame.progress);
  const motion = still ? 0 : 1;

  const vibration = motion * pose.throttle * (1 - 0.7 * airborne);
  const bob = motion * airborne * (Math.sin(time * 0.83) * 0.22 + Math.sin(time * 1.37 + 1.3) * 0.1);
  const sway = motion * airborne * (Math.sin(time * 0.61 + 0.4) * 0.006 + Math.sin(time * 1.1) * 0.003);
  const nod = motion * airborne * Math.sin(time * 0.72 + 2.1) * 0.0035;

  rig.root.position.set(
    pose.x,
    pose.y + bob + Math.sin(time * 47) * 0.0035 * vibration,
    pose.z,
  );
  rig.root.rotation.y = pose.yaw;
  // Positive rotation about X lowers the nose, so nose-up is negative.
  rig.pitch.rotation.x = -(pose.pitch + nod);
  rig.roll.rotation.z = pose.roll + sway + Math.sin(time * 39 + 1) * 0.0006 * vibration;

  state.gear = pose.gear;
  state.throttle = pose.throttle;
  state.landingLights = pose.landingLights;
  state.glow = frame.atmosphere.lamps;
}

const _target = new THREE.Vector3();

/** Portrait frames lift the aircraft into the upper half, above the text. */
const PORTRAIT_LIFT = 0.17;

/** Last view offset applied, so the projection is only rebuilt when it changes. */
const appliedOffset = { x: Number.NaN, y: Number.NaN, width: 0, height: 0 };

function applyCamera(camera: THREE.Camera, pose: CameraPose, width: number, height: number): void {
  camera.position.set(pose.px, pose.py, pose.pz);
  camera.up.set(pose.ux, pose.uy, pose.uz);
  camera.lookAt(_target.set(pose.tx, pose.ty, pose.tz));
  if (pose.roll !== 0) camera.rotateZ(pose.roll);
  if (!(camera instanceof THREE.PerspectiveCamera)) return;

  // Shift the picture inside the frame rather than turning the camera, so
  // the aircraft moves aside for the text without changing perspective.
  // Landscape frames move it sideways; portrait frames move it up.
  const landscape = THREE.MathUtils.smoothstep(width / height, 0.9, 1.35);
  const offsetX = Math.round(-pose.frameX * landscape * width);
  const offsetY = Math.round(PORTRAIT_LIFT * (1 - landscape) * height);
  const offsetChanged =
    offsetX !== appliedOffset.x ||
    offsetY !== appliedOffset.y ||
    width !== appliedOffset.width ||
    height !== appliedOffset.height;
  const fovChanged = Math.abs(camera.fov - pose.fov) > 0.01;

  if (fovChanged) camera.fov = pose.fov;
  if (offsetChanged) {
    appliedOffset.x = offsetX;
    appliedOffset.y = offsetY;
    appliedOffset.width = width;
    appliedOffset.height = height;
    // setViewOffset rebuilds the projection matrix itself.
    camera.setViewOffset(width, height, offsetX, offsetY, width, height);
  } else if (fovChanged) {
    camera.updateProjectionMatrix();
  }
}

interface FlightControllerProps {
  rigRef: RefObject<AircraftRig | null>;
  aircraftState: AircraftState;
  /** Disable time-based ambient motion. */
  still?: boolean;
}

/** Per-controller bookkeeping that must survive between frames. */
const session = { started: false };

/**
 * Runs first in every frame: turns scroll into drawn progress, computes the
 * frame's pose, camera and atmosphere, and places the aircraft and camera.
 * Everything else in the scene reads the result from `flightFrame`.
 */
export function FlightController({ rigRef, aircraftState, still = false }: FlightControllerProps) {
  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const progress = advanceProgress(dt, !session.started);
    session.started = true;
    commitFlightProgress(progress);

    const frame = flightFrame;
    if (progress !== frame.progress) frame.revision++;
    frame.progress = progress;
    frame.time = state.clock.elapsedTime;
    flightPose(progress, frame.pose);
    atmosphereAt(progress, frame.atmosphere);
    cameraPose(progress, frame.pose, frame.camera, 0);

    if (rigRef.current) applyRig(rigRef.current, frame, aircraftState, still);
    applyCamera(state.camera, frame.camera, state.size.width, state.size.height);
  }, -2);

  return null;
}

/** Forgets that a controller has run, so the next one starts by cutting to the scroll position. */
export function resetFlightSession(): void {
  session.started = false;
  appliedOffset.x = Number.NaN;
}
