"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { flightFrame } from "@/flight/frame";
import { getQuality } from "@/flight/quality";
import {
  type ShadowRig,
  createShadowRig,
  disposeShadowRig,
  precompileShadowPrograms,
  shadowUniforms,
  updateSunShadows,
} from "./sunShadow";

/** Seconds taken to fade shadows out when the profile drops them. */
const FADE_SECONDS = 1.5;

interface ShadowHolder {
  rig: ShadowRig | null;
}

/** Creates, updates or retires the shadow maps for one frame. */
function stepShadows(
  holder: ShadowHolder,
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  delta: number,
): void {
  const wanted = getQuality().shadows;
  let rig = holder.rig;
  if (!rig) {
    if (!wanted) {
      shadowUniforms.uShadowParams.value.x = 0;
      return;
    }
    rig = createShadowRig();
    precompileShadowPrograms(rig, gl, scene);
    holder.rig = rig;
  }
  if (!wanted) {
    rig.enabled = Math.max(0, rig.enabled - delta / FADE_SECONDS);
    if (rig.enabled === 0) {
      holder.rig = null;
      disposeShadowRig(rig);
      return;
    }
  }
  updateSunShadows(rig, gl, scene, flightFrame);
}

function releaseShadows(holder: ShadowHolder): void {
  if (holder.rig) disposeShadowRig(holder.rig);
  holder.rig = null;
}

/**
 * Keeps the sun's shadow maps up to date while the graphics profile allows
 * them. The maps are created on first use and, if the profile later drops
 * shadows, faded out and freed. Runs after the flight controller has placed
 * the aircraft and before the scene is drawn.
 */
export function SunShadows() {
  const holder = useRef<ShadowHolder>({ rig: null });
  useEffect(() => {
    const current = holder.current;
    return () => releaseShadows(current);
  }, []);
  useFrame(({ gl, scene }, delta) => stepShadows(holder.current, gl, scene, delta), -1);
  return null;
}
