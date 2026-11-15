"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { Airport } from "@/components/environments/Airport";
import { createAircraftState } from "@/flight/aircraft";
import { Aircraft, type AircraftRig } from "./Aircraft";
import { AircraftShadow } from "./AircraftShadow";
import { FlightController } from "./FlightController";
import { SceneLighting } from "./SceneLighting";
import { Sky } from "./Sky";

interface FlightSceneProps {
  /** Called once the aircraft is loaded and frames are being drawn. */
  onReady?: () => void;
  /** Disable time-based ambient motion. */
  still?: boolean;
}

/** Frames to draw after the aircraft appears before the scene is called ready. */
const WARM_UP_FRAMES = 3;

/**
 * Rendered inside the same Suspense boundary as the aircraft, so it only
 * starts counting once the model has loaded.
 */
function ReadySignal({ onReady }: { onReady?: () => void }) {
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current < 0) return;
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

  return (
    <>
      <FlightController rigRef={rigRef} aircraftState={aircraftState} still={still} />
      <Sky />
      <SceneLighting />
      <Airport />
      <AircraftShadow />
      <Suspense fallback={null}>
        <Aircraft rigRef={rigRef} state={aircraftState} still={still} />
        <ReadySignal onReady={onReady} />
      </Suspense>
    </>
  );
}
