"use client";

import { useEffect, useRef } from "react";

/** Seconds the playhead takes to cross the whole career. */
export const SWEEP_SECONDS = 2.6;
/** Pause after the sweep for the last labels and the playhead to settle. */
const SETTLE_SECONDS = 0.7;

interface TimelineSweepProps {
  /** Year the first role starts, shown on the playhead before any tick. */
  startYear: number;
  /** Track position after which the playhead reads "Present". */
  presentFrom: number;
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function fraction(element: HTMLElement, property: string): number {
  return Number.parseFloat(element.style.getPropertyValue(property)) || 0;
}

/**
 * Plays the career timeline in once when it scrolls into view: a playhead
 * runs from the first role to the present, each bar grows as the playhead
 * crosses it, and each role's label and chapter links appear when it begins.
 *
 * Positions come from the bars' own `--left`/`--width`, so the motion is
 * true to the dates. The timeline is fully drawn without JavaScript, with
 * reduced motion, when it is already on screen at load, or once played.
 */
export function TimelineSweep({ startYear, presentFrom }: TimelineSweepProps) {
  const sweepRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sweep = sweepRef.current;
    const figure = sweep?.closest<HTMLElement>(".timeline");
    if (!sweep || !figure) return;

    const box = figure.getBoundingClientRect();
    const onScreen = box.top < window.innerHeight && box.bottom > 0;
    if (reducedMotion() || onScreen || !("IntersectionObserver" in window)) {
      figure.dataset.reveal = "shown";
      return;
    }

    figure.dataset.reveal = "pending";
    let cancelled = false;
    let kill: (() => void) | null = null;

    const play = async () => {
      const { gsap } = await import("gsap");
      if (cancelled) return;

      const run = sweep.querySelector<HTMLElement>(".timeline-sweep-run");
      const year = sweep.querySelector<HTMLElement>(".timeline-head-year");
      const bars = Array.from(figure.querySelectorAll<HTMLElement>(".timeline-bar"));
      const ticks = Array.from(figure.querySelectorAll<HTMLElement>(".timeline-axis > [style]"))
        .map((element) => ({
          element,
          at: fraction(element, "--at"),
          year: element.textContent ?? "",
        }))
        .sort((a, b) => a.at - b.at);

      const yearAt = (progress: number) => {
        if (progress >= presentFrom) return "Present";
        let label = String(startYear);
        for (const tick of ticks) if (tick.at <= progress) label = tick.year;
        return label;
      };

      figure.dataset.reveal = "playing";
      const timeline = gsap.timeline({
        defaults: { ease: "none" },
        onComplete: () => {
          gsap.set([...bars, run], { clearProps: "transform" });
          figure.dataset.reveal = "shown";
          delete figure.dataset.swept;
        },
      });

      if (run) {
        let shown = "";
        timeline.fromTo(
          run,
          { xPercent: 0 },
          {
            xPercent: 100,
            duration: SWEEP_SECONDS,
            onUpdate() {
              const label = yearAt(this.progress());
              if (year && label !== shown) year.textContent = shown = label;
            },
          },
          0,
        );
      }

      for (const bar of bars) {
        const at = fraction(bar, "--left") * SWEEP_SECONDS;
        const row = bar.closest<HTMLElement>(".timeline-row");
        // The bar's leading edge rides the playhead.
        timeline.fromTo(
          bar,
          { scaleX: 0 },
          { scaleX: 1, duration: fraction(bar, "--width") * SWEEP_SECONDS },
          at,
        );
        if (row) timeline.call(() => void (row.dataset.lit = "true"), undefined, at);
      }

      for (const tick of ticks) {
        timeline.call(() => void (tick.element.dataset.lit = "true"), undefined, tick.at * SWEEP_SECONDS);
      }

      timeline.call(() => void (figure.dataset.swept = "true"), undefined, SWEEP_SECONDS);
      timeline.to({}, { duration: SETTLE_SECONDS }, SWEEP_SECONDS);

      kill = () => timeline.kill();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void play();
      },
      // Start once the timeline is a fifth of the way up the screen.
      { rootMargin: "0px 0px -20% 0px" },
    );
    observer.observe(figure);

    return () => {
      cancelled = true;
      observer.disconnect();
      kill?.();
      figure.dataset.reveal = "shown";
      delete figure.dataset.swept;
      for (const element of figure.querySelectorAll<HTMLElement>("[data-lit]")) {
        delete element.dataset.lit;
      }
    };
  }, [startYear, presentFrom]);

  return (
    <div ref={sweepRef} className="timeline-sweep" aria-hidden="true">
      <div className="timeline-sweep-run">
        <span className="timeline-head">
          <span className="timeline-head-year">{startYear}</span>
        </span>
      </div>
    </div>
  );
}
