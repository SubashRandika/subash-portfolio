"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import { flightFrame } from "@/flight/frame";
import {
  type ShadowRig,
  createShadowRig,
  disposeShadowRig,
  shadowUniforms,
  updateSunShadows,
} from "./sunShadow";

/**
 * True when WebGL is running on a software rasteriser (no usable GPU). Shadow
 * maps redraw the whole world from the sun, which such a renderer cannot
 * afford; the scene is still complete without them.
 */
export function isSoftwareRenderer(gl: THREE.WebGLRenderer): boolean {
  const context = gl.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(renderer);
}

/**
 * Watches how long frames take with shadows on. If the device cannot keep
 * up, shadows fade out for the rest of the visit; the scene stays smooth.
 */
export const SHADOW_BUDGET = {
  /** Frames ignored at the start, while shaders compile and tiles stream in. */
  warmUp: 120,
  /** Frames averaged per verdict. */
  window: 90,
  /** Average frame time, in milliseconds, above which shadows are given up. */
  limit: 25,
  /** A frame this long is a pause (a hidden tab, a jump), not a measurement. */
  ignoreAbove: 120,
  /** Seconds taken to fade shadows out. */
  fade: 1.5,
} as const;

export interface ShadowBudget {
  frames: number;
  samples: number;
  total: number;
  /** Shadows have been given up for this visit. */
  dropped: boolean;
}

export function createShadowBudget(): ShadowBudget {
  return { frames: 0, samples: 0, total: 0, dropped: false };
}

/** Records one frame. Returns true at the moment shadows should be given up. */
export function recordShadowFrame(budget: ShadowBudget, deltaMs: number): boolean {
  if (budget.dropped) return false;
  budget.frames++;
  if (budget.frames <= SHADOW_BUDGET.warmUp || deltaMs > SHADOW_BUDGET.ignoreAbove) return false;
  budget.samples++;
  budget.total += deltaMs;
  if (budget.samples < SHADOW_BUDGET.window) return false;
  const average = budget.total / budget.samples;
  budget.samples = 0;
  budget.total = 0;
  if (average <= SHADOW_BUDGET.limit) return false;
  budget.dropped = true;
  return true;
}

/**
 * Keeps the sun's shadow maps up to date. Runs after the flight controller
 * has placed the aircraft and before the scene is drawn.
 */
export function SunShadows() {
  const gl = useThree((state) => state.gl);
  const rig = useRef<ShadowRig | null>(null);
  const budget = useRef<ShadowBudget>(createShadowBudget());
  // Created and released by the effect, so a remount (React's development
  // double-mount included) always gets a fresh, live set of maps.
  useEffect(() => {
    // ?shadows=off turns them off, for profiling.
    const off = new URLSearchParams(window.location.search).get("shadows") === "off";
    if (off || isSoftwareRenderer(gl)) {
      shadowUniforms.uShadowParams.value.x = 0;
      return;
    }
    const created = createShadowRig();
    rig.current = created;
    budget.current = createShadowBudget();
    return () => {
      rig.current = null;
      disposeShadowRig(created);
    };
  }, [gl]);
  useFrame(({ scene }, delta) => {
    const current = rig.current;
    if (!current) return;
    recordShadowFrame(budget.current, delta * 1000);
    if (budget.current.dropped) {
      current.enabled = Math.max(0, current.enabled - delta / SHADOW_BUDGET.fade);
      if (current.enabled === 0) {
        // Gone for good: free the maps and stop drawing them.
        rig.current = null;
        disposeShadowRig(current);
        return;
      }
    }
    updateSunShadows(current, gl, scene, flightFrame);
  }, -1);
  return null;
}
