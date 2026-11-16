"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import portrait from "@/assets/subash-rodrigo-portrait.jpg";

interface PortraitProps {
  name: string;
  title: string;
  /** Year the career began, for the caption. */
  since: number;
}

/** Largest tilt of the plate under the pointer, in degrees. */
const MAX_TILT = 6;

/** True if the media query matches; false where media queries are unavailable. */
function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * Holds the figure back until it scrolls into view, then reveals it once.
 * Shown at once when motion is reduced or it is already on screen.
 */
function reveal(figure: HTMLElement, reduced: boolean): () => void {
  const box = figure.getBoundingClientRect();
  const onScreen = box.top < window.innerHeight && box.bottom > 0;
  if (reduced || onScreen || !("IntersectionObserver" in window)) {
    figure.dataset.reveal = "shown";
    return () => undefined;
  }
  figure.dataset.reveal = "pending";
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      figure.dataset.reveal = "shown";
      observer.disconnect();
    },
    { threshold: 0.3 },
  );
  observer.observe(figure);
  return () => observer.disconnect();
}

/**
 * Tilts the plate toward a fine pointer. Written to CSS custom properties,
 * never to React state, so moving the pointer re-renders nothing. Touch and
 * keyboard users get the still plate.
 */
function tiltWithPointer(stage: HTMLElement): () => void {
  let frame = 0;
  const tilt = (x: number, y: number, active: boolean) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      stage.style.setProperty("--tilt-x", `${(x * MAX_TILT * 2).toFixed(2)}deg`);
      stage.style.setProperty("--tilt-y", `${(-y * MAX_TILT * 2).toFixed(2)}deg`);
      stage.style.setProperty("--shift-x", (x * 2).toFixed(3));
      stage.style.setProperty("--shift-y", (y * 2).toFixed(3));
      stage.style.setProperty("--sheen-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      stage.style.setProperty("--sheen-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      stage.dataset.tilting = active ? "true" : "false";
    });
  };
  const clampHalf = (value: number) => Math.max(-0.5, Math.min(0.5, value));
  const onMove = (event: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    tilt(
      clampHalf((event.clientX - rect.left) / rect.width - 0.5),
      clampHalf((event.clientY - rect.top) / rect.height - 0.5),
      true,
    );
  };
  const onLeave = () => tilt(0, 0, false);
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
  };
}

function animate(figure: HTMLElement): () => void {
  const reduced = matches("(prefers-reduced-motion: reduce)");
  const stopReveal = reveal(figure, reduced);
  const stage = figure.querySelector<HTMLElement>(".portrait-stage");
  const finePointer = matches("(hover: hover) and (pointer: fine)");
  const stopTilt = stage && finePointer && !reduced ? tiltWithPointer(stage) : () => undefined;
  return () => {
    stopReveal();
    stopTilt();
  };
}

/**
 * Subash's portrait, presented as a figure plate: a white plate with
 * viewfinder corners, an orbit circling behind it, and a "Fig. 01" caption.
 * On first view the plate wipes open, the photograph develops from a soft
 * monochrome into colour, and the orbit, corners and caption settle in.
 */
export function Portrait({ name, title, since }: PortraitProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return animate(ref.current);
  }, []);

  return (
    <figure ref={ref} className="portrait">
      <div className="portrait-stage">
        <svg className="portrait-orbit" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="portrait-orbit-ring" cx="60" cy="60" r="57" pathLength="100" />
          <g className="portrait-orbit-travel" data-speed="slow">
            <circle className="portrait-orbit-dot" data-tone="accent" cx="60" cy="3" r="2.6" />
          </g>
          <g className="portrait-orbit-travel" data-speed="fast">
            <circle className="portrait-orbit-dot" data-tone="link" cx="60" cy="117" r="1.7" />
          </g>
        </svg>

        <div className="portrait-plate">
          <Image
            src={portrait}
            alt={`${name}, ${title}`}
            placeholder="blur"
            sizes="(min-width: 64rem) 19rem, (min-width: 48rem) 17rem, 68vw"
            className="portrait-image"
          />
          <span className="portrait-sheen" aria-hidden="true" />
          <span className="portrait-scan" aria-hidden="true" />
        </div>

        {(["tl", "tr", "bl", "br"] as const).map((corner) => (
          <span key={corner} className="portrait-corner" data-corner={corner} aria-hidden="true" />
        ))}
      </div>

      <figcaption className="portrait-caption">
        <span className="type-label text-accent-ink">Fig. 01</span>
        <span className="font-bold">{name}</span>
        <span className="type-small text-ink-muted">
          {title}, since {since}
        </span>
      </figcaption>
    </figure>
  );
}
