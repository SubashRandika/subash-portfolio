"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { setFlightTarget } from "@/flight/store";
import { fallBackToStatic, markFlightReady, useFlightMode } from "@/hooks/useFlightMode";

const FlightExperience = dynamic(() => import("@/components/flight/FlightExperience"), {
  ssr: false,
});

/** Catches render errors from the 3D scene and reports them once. */
class SceneBoundary extends Component<
  { onError: (reason: string) => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error instanceof Error ? error.message : "3D scene failed");
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Maps the scroll position of the flight section onto flight progress. */
function useScrollProgress(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const section = document.getElementById("flight");
    if (!section) return;

    const update = () => {
      const rect = section.getBoundingClientRect();
      const distance = rect.height - window.innerHeight;
      setFlightTarget(distance > 0 ? -rect.top / distance : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);
}

/**
 * The stage's 3D layer. It renders nothing until the page is in live mode,
 * then loads the WebGL scene on demand. If WebGL cannot start, or the context
 * is lost, the whole page drops back to the static experience.
 */
export function FlightStage() {
  const mode = useFlightMode();
  const live = mode === "live";
  const hostRef = useRef<HTMLDivElement>(null);
  const [onScreen, setOnScreen] = useState(true);

  useScrollProgress(live);

  // Stop rendering frames while the stage is scrolled out of view.
  useEffect(() => {
    const host = hostRef.current;
    if (!live || !host) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setOnScreen(entry.isIntersecting);
      },
      { rootMargin: "120px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [live]);

  const handleFail = useCallback((reason: string) => {
    console.warn(`[flight] Falling back to the static experience: ${reason}`);
    fallBackToStatic();
  }, []);

  return (
    <div ref={hostRef} className="flight-canvas">
      {live ? (
        <SceneBoundary onError={handleFail}>
          <FlightExperience active={onScreen} onReady={markFlightReady} onFail={handleFail} />
        </SceneBoundary>
      ) : null}
    </div>
  );
}
