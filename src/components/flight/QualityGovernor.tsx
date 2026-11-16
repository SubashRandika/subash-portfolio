"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type * as THREE from "three";
import {
  type DeviceSignals,
  type Governor,
  QUALITY,
  SOFTWARE_PIXEL_RATIO,
  createGovernor,
  getQuality,
  initialTier,
  recordFrame,
  setQualityTier,
  tierOverride,
} from "@/flight/quality";

/**
 * True when WebGL is running on a software rasteriser (no usable GPU, as in
 * some virtual machines, remote desktops and headless browsers).
 */
export function isSoftwareRenderer(gl: THREE.WebGLRenderer): boolean {
  const context = gl.getContext();
  const info = context.getExtension("WEBGL_debug_renderer_info");
  const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
  return /swiftshader|llvmpipe|softpipe|software|microsoft basic render/i.test(renderer);
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

function deviceSignals(gl: THREE.WebGLRenderer): DeviceSignals {
  const hints = navigator as Navigator & NavigatorHints;
  return {
    software: isSoftwareRenderer(gl),
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    shortSide: Math.min(window.screen.width, window.screen.height),
    deviceMemory: hints.deviceMemory,
    cores: navigator.hardwareConcurrency,
    saveData: hints.connection?.saveData,
  };
}

/** Records the profile on the page, for tests and for anyone curious. */
function markTier(tier: string): void {
  document.documentElement.dataset.flightQuality = tier;
}

/**
 * Chooses the graphics profile and keeps it honest.
 *
 * Starts from what the device is (see initialTier), then watches real frame
 * times and steps down a profile if the device cannot keep up. Applies the
 * pixel ratio itself; the rest of the scene reads getQuality() each frame or
 * subscribes to changes.
 */
export function QualityGovernor() {
  const gl = useThree((state) => state.gl);
  const setDpr = useThree((state) => state.setDpr);
  const governor = useRef<Governor | null>(null);

  useEffect(() => {
    const signals = deviceSignals(gl);
    const forced = tierOverride(window.location.search);
    const tier = forced ?? initialTier(signals);
    setQualityTier(tier);
    markTier(tier);
    const ratio = Math.min(window.devicePixelRatio || 1, QUALITY[tier].maxPixelRatio);
    setDpr(signals.software ? SOFTWARE_PIXEL_RATIO : ratio);
    // A forced profile and a software renderer are left where they are.
    governor.current = forced || signals.software ? null : createGovernor(tier);
    return () => {
      governor.current = null;
    };
  }, [gl, setDpr]);

  useFrame((_, delta) => {
    if (!governor.current) return;
    const next = recordFrame(governor.current, delta * 1000);
    if (!next) return;
    setQualityTier(next);
    markTier(next);
    setDpr(Math.min(window.devicePixelRatio || 1, getQuality().maxPixelRatio));
  });

  return null;
}
