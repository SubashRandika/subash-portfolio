"use client";

import { useSyncExternalStore } from "react";

export type FlightMode = "live" | "static";

/**
 * The flight mode is decided before first paint by an inline script in the
 * document head (see src/lib/flight-mode-script.ts) and stored on <html data-flight>.
 * Keeping it on the document, not in React state, lets CSS lay the page out
 * correctly before hydration and avoids a layout shift.
 */
function readMode(): FlightMode {
  return document.documentElement.dataset.flight === "live" ? "live" : "static";
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-flight"],
  });
  return () => observer.disconnect();
}

/** Server-rendered HTML is always the static experience. */
const serverMode = (): FlightMode => "static";

export function useFlightMode(): FlightMode {
  return useSyncExternalStore(subscribe, readMode, serverMode);
}

/** Switches to the static experience, e.g. when WebGL fails. */
export function fallBackToStatic(): void {
  const root = document.documentElement;
  root.dataset.flight = "static";
  delete root.dataset.flightReady;
}

/** Marks the 3D scene as drawn so the poster can fade out. */
export function markFlightReady(): void {
  document.documentElement.dataset.flightReady = "true";
}
