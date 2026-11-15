"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { resetFlightSession } from "./FlightController";
import { FlightScene } from "./FlightScene";

export interface FlightExperienceProps {
  /** Render frames only while the stage is on screen. */
  active: boolean;
  /** The first frames have been drawn; the poster can fade out. */
  onReady: () => void;
  /** WebGL could not start or was lost; fall back to the static experience. */
  onFail: (reason: string) => void;
}

/**
 * The WebGL canvas for the flight. This module and everything it imports
 * (Three.js, React Three Fiber, the scene) is loaded on demand, after the
 * page's HTML has painted.
 */
export default function FlightExperience({ active, onReady, onFail }: FlightExperienceProps) {
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    resetFlightSession();
    return () => {
      cleanup.current?.();
      cleanup.current = null;
    };
  }, []);

  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: false,
        stencil: false,
        powerPreference: "high-performance",
      }}
      camera={{ fov: 32, near: 0.8, far: 70_000, position: [-22, 4.4, 38] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.setClearColor(0x05080f, 1);

        const canvas = gl.domElement;
        const onLost = (event: Event) => {
          event.preventDefault();
          onFail("WebGL context lost");
        };
        canvas.addEventListener("webglcontextlost", onLost);
        cleanup.current = () => canvas.removeEventListener("webglcontextlost", onLost);
      }}
      fallback={null}
    >
      <FlightScene onReady={onReady} />
    </Canvas>
  );
}
