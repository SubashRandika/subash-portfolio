"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getSegment, subscribeSegment } from "@/flight/store";
import { airportStructures, cityStructures, industrialStructures } from "@/flight/structures";
import type { TimelineSegment } from "@/flight/timeline";
import { Clouds } from "./Clouds";
import { Structures } from "./Structures";
import { Terrain } from "./Terrain";

const serverSegment = (): TimelineSegment => 0;

/**
 * True while the flight is within a window of chapters. Re-renders only when
 * the chapter changes, never per frame.
 */
function useSegmentWindow(from: TimelineSegment, to: TimelineSegment): boolean {
  const segment = useSyncExternalStore(subscribeSegment, getSegment, serverSegment);
  return segment >= from && segment <= to;
}

function AirportBuildings() {
  const items = useMemo(() => airportStructures(), []);
  return <Structures items={items} />;
}

/** Chapter 3: works, logistics yards and warehouses on the plain. */
function IndustrialRegion() {
  const items = useMemo(() => industrialStructures(), []);
  return <Structures items={items} />;
}

/** Chapter 5: the business district, mid-rise blocks and bridges. */
function City() {
  const items = useMemo(() => cityStructures(), []);
  return <Structures items={items} />;
}

/**
 * The world below the aircraft. The terrain (coast, mountain valleys,
 * uplands and highlands) streams in tiles as it is needed; built-up areas
 * are mounted only from the chapter before theirs to the chapter after, so
 * the six environments are never all loaded at once.
 */
export function Environments() {
  const airport = useSegmentWindow(0, 2);
  const industry = useSegmentWindow(2, 4);
  const city = useSegmentWindow(4, 6);

  return (
    <>
      <Terrain />
      {airport ? <AirportBuildings /> : null}
      {industry ? <IndustrialRegion /> : null}
      {city ? <City /> : null}
      <Clouds />
    </>
  );
}
