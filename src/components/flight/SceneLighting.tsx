"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { AIRCRAFT_CENTRELINE_Y } from "@/flight/aircraft";
import { type FlightFrame, flightFrame } from "@/flight/frame";
import { MIN_LIGHT_HEIGHT } from "./lightingUniforms";

/** Distance of the sun light from the aircraft. Direction is what matters. */
const SUN_DISTANCE = 600;

interface Lights {
  sun: THREE.DirectionalLight | null;
  hemisphere: THREE.HemisphereLight | null;
  fog: THREE.FogExp2 | null;
}

function applyLighting(lights: Lights, frame: FlightFrame, gl: THREE.WebGLRenderer): void {
  const { atmosphere, pose } = frame;
  const { sun, hemisphere, fog } = lights;

  if (sun) {
    const [sx, sy, sz] = atmosphere.sunDirection;
    // Before sunrise the sun is below the horizon; never light from beneath.
    const height = Math.max(sy, MIN_LIGHT_HEIGHT);
    const length = Math.hypot(sx, height, sz) || 1;
    const targetY = pose.y + AIRCRAFT_CENTRELINE_Y;
    sun.position.set(
      pose.x + (sx / length) * SUN_DISTANCE,
      targetY + (height / length) * SUN_DISTANCE,
      pose.z + (sz / length) * SUN_DISTANCE,
    );
    sun.target.position.set(pose.x, targetY, pose.z);
    sun.target.updateMatrixWorld();
    sun.color.setRGB(...atmosphere.sunColor);
    sun.intensity = atmosphere.sunIntensity;
  }

  if (hemisphere) {
    hemisphere.color.setRGB(...atmosphere.ambientSky);
    hemisphere.groundColor.setRGB(...atmosphere.ambientGround);
    hemisphere.intensity = atmosphere.ambientIntensity;
  }

  if (fog) {
    fog.color.setRGB(...atmosphere.fogColor);
    fog.density = atmosphere.fogDensity;
  }

  gl.toneMappingExposure = atmosphere.exposure;
}

/**
 * Sun, sky fill and haze. All three follow the frame's atmosphere so the
 * aircraft, the ground and the sky always agree about the time of day.
 */
export function SceneLighting() {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const fogRef = useRef<THREE.FogExp2>(null);

  useFrame((state) => {
    applyLighting(
      { sun: sunRef.current, hemisphere: hemisphereRef.current, fog: fogRef.current },
      flightFrame,
      state.gl,
    );
  });

  return (
    <>
      <fogExp2 ref={fogRef} attach="fog" args={["#1a2134", 0.00015]} />
      <hemisphereLight ref={hemisphereRef} args={["#5d76ad", "#16181f", 0.4]} />
      <directionalLight ref={sunRef} args={["#ffffff", 0]} />
    </>
  );
}
