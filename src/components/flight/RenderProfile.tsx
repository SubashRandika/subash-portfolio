"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { isSoftwareRenderer } from "./SunShadows";

/** Pixel ratio used when WebGL runs on a software rasteriser. */
export const SOFTWARE_PIXEL_RATIO = 0.5;

/**
 * The lowest graphics profile: without a usable GPU (a virtual machine, a
 * remote desktop, a blocklisted driver) every pixel is shaded on the CPU, so
 * the canvas renders at half resolution and is scaled up. Sun shadows are
 * already off in this case (see SunShadows).
 */
export function RenderProfile() {
  const gl = useThree((state) => state.gl);
  const setDpr = useThree((state) => state.setDpr);
  useEffect(() => {
    if (isSoftwareRenderer(gl)) setDpr(SOFTWARE_PIXEL_RATIO);
  }, [gl, setDpr]);
  return null;
}
