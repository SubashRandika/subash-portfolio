"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getSegment, subscribeSegment } from "@/flight/store";
import {
  type Structure,
  airportStructures,
  cityStructureSteps,
  industrialStructureSteps,
} from "@/flight/structures";
import type { TimelineSegment } from "@/flight/timeline";
import { useQuality } from "@/hooks/useQuality";
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

/** Milliseconds per frame spent laying out a district. */
const LAYOUT_SLICE_MS = 4;

type LayoutSteps = (out: Structure[]) => Generator<void, void, void>;

/** Districts already laid out this visit: a revisit costs nothing. */
const laidOut = new Map<LayoutSteps, Structure[]>();

/**
 * Lays out a district a few milliseconds per frame instead of all at once,
 * so the flight never stalls while thousands of buildings are placed.
 * Returns null until the layout is complete. Districts mount a chapter ahead
 * of their own, so the layout is normally done long before it is seen.
 */
function useDistrictLayout(steps: LayoutSteps): Structure[] | null {
  const [items, setItems] = useState<Structure[] | null>(() => laidOut.get(steps) ?? null);

  useEffect(() => {
    if (items) return;
    const out: Structure[] = [];
    const generator = steps(out);
    let handle = 0;
    const work = () => {
      const start = performance.now();
      while (performance.now() - start < LAYOUT_SLICE_MS) {
        if (generator.next().done) {
          laidOut.set(steps, out);
          setItems(out);
          return;
        }
      }
      handle = requestAnimationFrame(work);
    };
    handle = requestAnimationFrame(work);
    return () => cancelAnimationFrame(handle);
  }, [steps, items]);

  return items;
}

const NO_STRUCTURES: readonly Structure[] = [];

/** Drops rooftop plant and other small parts on the lowest graphics profile. */
function useDetail(items: readonly Structure[]): readonly Structure[] {
  const { buildingDetail } = useQuality();
  return useMemo(
    () => (buildingDetail ? items : items.filter((item) => item.kind !== "plant")),
    [items, buildingDetail],
  );
}

function AirportBuildings() {
  const items = useMemo(() => airportStructures(), []);
  return <Structures items={useDetail(items)} />;
}

/** Chapter 3: works, logistics yards and warehouses on the plain. */
function IndustrialRegion() {
  const items = useDetail(useDistrictLayout(industrialStructureSteps) ?? NO_STRUCTURES);
  return items.length > 0 ? <Structures items={items} /> : null;
}

/** Chapter 5: the business district, mid-rise blocks and bridges. */
function City() {
  const items = useDetail(useDistrictLayout(cityStructureSteps) ?? NO_STRUCTURES);
  return items.length > 0 ? <Structures items={items} /> : null;
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
