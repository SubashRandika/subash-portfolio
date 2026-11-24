"use client";

import { type RefObject, useEffect, useRef } from "react";
import {
  CLIP_INDICES,
  type FilmFraming,
  TALL_QUERY,
  filmQualityFor,
  linesNeeded,
} from "@/flight/film";
import { markFlightReady, useFlightMode } from "@/hooks/useFlightMode";
import type { FilmPlayer } from "./filmPlayer";

/**
 * Starts the flight director (the GSAP master timeline) while the page is in
 * live mode. GSAP is loaded on demand so static-mode visitors never download it.
 */
function useFlightDirector(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const section = document.getElementById("flight");
    if (!section) return;

    let cancelled = false;
    let destroy: (() => void) | null = null;

    void import("@/components/flight/director").then(({ createFlightDirector }) => {
      if (cancelled) return;
      destroy = createFlightDirector(section).destroy;
    });

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [enabled]);
}

/**
 * Runs the film player while in live mode, in the framing that suits the
 * screen and the quality that suits the connection, and pauses it while the stage is scrolled out of view.
 */
function useFilmPlayer(enabled: boolean, host: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = host.current;
    if (!enabled || !element) return;

    const tall = window.matchMedia(TALL_QUERY);
    let cancelled = false;
    let player: FilmPlayer | null = null;
    let onScreen = true;

    const start = async () => {
      const { createFilmPlayer } = await import("./filmPlayer");
      if (cancelled) return;
      player?.destroy();
      const framing: FilmFraming = tall.matches ? "tall" : "wide";
      const connection = (navigator as Navigator & { connection?: { effectiveType?: string } })
        .connection;
      const box = element.getBoundingClientRect();
      const lines = linesNeeded(box, framing, window.devicePixelRatio || 1);
      const quality = filmQualityFor(connection?.effectiveType, lines);
      player = createFilmPlayer(element, {
        framing,
        quality,
        onReady: markFlightReady,
      });
      player.setActive(onScreen);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        onScreen = entry.isIntersecting;
        player?.setActive(onScreen);
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);

    // Turning a tablet round switches framing.
    const onChange = () => void start();
    tall.addEventListener("change", onChange);
    void start();

    return () => {
      cancelled = true;
      tall.removeEventListener("change", onChange);
      observer.disconnect();
      player?.destroy();
      player = null;
    };
  }, [enabled, host]);
}

/**
 * The stage's film layer: one muted, never-autoplaying video per clip of the
 * film, stacked in order. Nothing is fetched until the page is in live
 * mode; the film player then loads the clips and scrubs them with scroll.
 */
export function FlightStage() {
  const mode = useFlightMode();
  const live = mode === "live";
  const hostRef = useRef<HTMLDivElement>(null);

  useFlightDirector(live);
  useFilmPlayer(live, hostRef);

  return (
    <div ref={hostRef} className="flight-film">
      {CLIP_INDICES.map((index) => (
        <div key={index} className="film-clip" data-film-clip={index}>
          <video muted playsInline preload="none" disablePictureInPicture tabIndex={-1} />
        </div>
      ))}
    </div>
  );
}
