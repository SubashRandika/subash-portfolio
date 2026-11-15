/**
 * The flight's shared state.
 *
 * `target` is where scrolling says the flight should be; `progress` is the
 * smoothed value everything is drawn from. Both are plain mutable numbers
 * read inside the render loop. React is only told about coarse changes
 * (which chapter is current), through `subscribeSegment`.
 */

import { type TimelineSegment, clamp01, segmentAt } from "./timeline";

type SegmentListener = (segment: TimelineSegment) => void;

interface FlightStore {
  /** Progress requested by scroll, 0–1. */
  target: number;
  /** Smoothed progress the scene is rendered at, 0–1. */
  progress: number;
  /** Segment containing `progress`. */
  segment: TimelineSegment;
}

export const flightStore: FlightStore = {
  target: 0,
  progress: 0,
  segment: 0,
};

const segmentListeners = new Set<SegmentListener>();

/** Sets where the flight should be. Called from the scroll handler. */
export function setFlightTarget(progress: number): void {
  flightStore.target = clamp01(progress);
}

/**
 * Sets the progress the scene is drawn at and notifies segment listeners if
 * the chapter changed. Called once per frame by the flight controller.
 */
export function commitFlightProgress(progress: number): void {
  const value = clamp01(progress);
  flightStore.progress = value;
  const segment = segmentAt(value);
  if (segment !== flightStore.segment) {
    flightStore.segment = segment;
    for (const listener of segmentListeners) listener(segment);
  }
}

/** Subscribes to chapter changes. Returns an unsubscribe function. */
export function subscribeSegment(listener: SegmentListener): () => void {
  segmentListeners.add(listener);
  return () => {
    segmentListeners.delete(listener);
  };
}

export function getSegment(): TimelineSegment {
  return flightStore.segment;
}

/** Restores the initial state. Used by tests. */
export function resetFlightStore(): void {
  flightStore.target = 0;
  flightStore.progress = 0;
  flightStore.segment = 0;
  segmentListeners.clear();
}
