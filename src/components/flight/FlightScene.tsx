"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Airport } from "@/components/environments/Airport";
import { useQuality } from "@/hooks/useQuality";
import { Environments } from "@/components/environments/Environments";
import { terrainStatus } from "@/components/environments/Terrain";
import { createAircraftState } from "@/flight/aircraft";
import { Aircraft, type AircraftRig } from "./Aircraft";
import { AircraftShadow } from "./AircraftShadow";
import { FlightController } from "./FlightController";
import { QualityGovernor } from "./QualityGovernor";
import { SceneLighting } from "./SceneLighting";
import { Sky } from "./Sky";
import { SunShadows } from "./SunShadows";

interface FlightSceneProps {
  /** Called once the aircraft is loaded and frames are being drawn. */
  onReady?: () => void;
  /** Disable time-based ambient motion. */
  still?: boolean;
}

/** Frames to draw after the aircraft appears before the scene is called ready. */
const WARM_UP_FRAMES = 3;

/**
 * Compiles every material in the scene in the background once the aircraft
 * has loaded, including those not yet visible (the cloud deck), so nothing
 * stalls on shader compilation when it first comes into view.
 */
function Precompile() {
  const done = useRef(false);
  useFrame(({ gl, scene, camera }) => {
    if (done.current) return;
    done.current = true;
    void gl.compileAsync(scene, camera).catch(() => undefined);
  });
  return null;
}

/**
 * Rendered inside the same Suspense boundary as the aircraft, so it only
 * starts counting once the model has loaded.
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current < 0) return;
    // The ground compiles in the background; wait for it to be drawn.
    if (!terrainStatus.ready) return;
    frames.current++;
    if (frames.current >= WARM_UP_FRAMES) {
      frames.current = -1;
      onReady?.();
    }
  });
  return null;
}

/** Everything inside the canvas. */
export function FlightScene({ onReady, still = false }: FlightSceneProps) {
  const rigRef = useRef<AircraftRig | null>(null);
  const aircraftState = useMemo(() => createAircraftState(), []);
  const { glows } = useQuality();

  return (
    <>
      <QualityGovernor />
      <FlightController rigRef={rigRef} aircraftState={aircraftState} still={still} />
      <Sky />
      <SceneLighting />
      <SunShadows />
      <Environments />
      <Airport />
      <AircraftShadow />
      <Suspense fallback={null}>
        <Aircraft rigRef={rigRef} state={aircraftState} still={still} glows={glows} />
        <ReadySignal onReady={onReady} />
        <Precompile />
      </Suspense>
    </>
  );
}
