"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { DocSection } from "@/components/ui/DocSection";
import { Icon } from "@/components/ui/Icon";
import { pad2 } from "@/lib/utils";
import type { Recommendation } from "@/types/portfolio";

/** How long each recommendation stays in focus before the next, in ms. */
export const ADVANCE_MS = 8000;

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/** "Clyde Casiechitty" → "CC" */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join("");
}

/** "2025-02-07" → "February 2025" */
function monthYear(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

interface RecommendationsProps {
  items: readonly Recommendation[];
  /** Where all of them can be read, on LinkedIn. */
  source: string | null;
}

/**
 * Recommendations from LinkedIn as a carousel: one recommendation in focus,
 * the next peeking in. It moves on by itself (a bar fills on the current
 * dot) and pauses while the pointer or focus is on it, while a full text is
 * open, when it is off screen or the tab is hidden, or when the visitor
 * presses Pause. Arrows, dots, swiping and the scrollbar all move it.
 * Reduced motion: it never moves by itself.
 *
 * The track is a plain scroll-snap list, so without JavaScript it is still
 * a row of cards that scrolls sideways.
 */
export function Recommendations({ items, source }: RecommendationsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reading, setReading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const count = items.length;
  const autoplay = !reduced && playing;
  const running = autoplay && !hovered && !focused && !reading && visible && !tabHidden;

  useEffect(() => {
    // Read once on the client; the server renders as if motion is allowed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(matches("(prefers-reduced-motion: reduce)"));
    const onVisibility = () => setTabHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    const root = rootRef.current;
    let observer: IntersectionObserver | undefined;
    if (root && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
        threshold: 0.35,
      });
      observer.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  // Keep the current card in step with the track's scroll position, however
  // it was moved (buttons, swipe, keyboard, scrollbar).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const slides = track.querySelectorAll<HTMLElement>(".rec-slide");
        const start = track.scrollLeft;
        let nearest = 0;
        let best = Infinity;
        slides.forEach((slide, index) => {
          const distance = Math.abs(slide.offsetLeft - track.offsetLeft - start);
          if (distance < best) {
            best = distance;
            nearest = index;
          }
        });
        setActive(nearest);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const target = (index + count) % count;
      const slide = track.querySelectorAll<HTMLElement>(".rec-slide")[target];
      if (!slide) return;
      // Only the track scrolls; the page stays where it is.
      track.scrollTo?.({
        left: slide.offsetLeft - track.offsetLeft,
        behavior: matches("(prefers-reduced-motion: reduce)") ? "auto" : "smooth",
      });
      setActive(target);
    },
    [count],
  );

  if (count === 0) return null;

  return (
    <DocSection
      id="recommendations"
      title="Recommendations"
      note="What colleagues and managers have written about working with me, quoted from LinkedIn."
      wide
    >
      <div
        ref={rootRef}
        className="rec-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Recommendations from LinkedIn"
        data-running={running ? "true" : "false"}
        style={{ "--rec-advance": `${ADVANCE_MS}ms` } as CSSProperties}
        onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
        }}
      >
        <div
          ref={trackRef}
          className="rec-track"
          // Announce changes only when the visitor makes them.
          aria-live={running ? "off" : "polite"}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="rec-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${count}: ${item.name}`}
              data-active={index === active ? "true" : undefined}
              style={{ "--i": index } as CSSProperties}
            >
              <figure className="rec-card">
                <span className="rec-mark" aria-hidden="true">
                  “
                </span>
                <blockquote className="rec-excerpt">
                  <p>{item.excerpt}</p>
                </blockquote>
                <details
                  className="rec-full"
                  onToggle={(event) => {
                    const open = (event.currentTarget as HTMLDetailsElement).open;
                    const anyOpen =
                      open || Boolean(trackRef.current?.querySelector("details.rec-full[open]"));
                    setReading(anyOpen);
                  }}
                >
                  <summary>
                    <span className="rec-summary-open">Read the full recommendation</span>
                    <span className="rec-summary-close">Hide the full recommendation</span>
                  </summary>
                  <blockquote className="rec-text">
                    {item.text.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </blockquote>
                </details>
                <figcaption className="rec-person">
                  <span className="rec-monogram" aria-hidden="true">
                    {initialsOf(item.name)}
                  </span>
                  <span className="rec-who">
                    <span className="rec-name">{item.name}</span>
                    <span className="rec-headline">{item.headline}</span>
                    <span className="rec-relation">
                      {item.relationship} · <time dateTime={item.date}>{monthYear(item.date)}</time>
                    </span>
                  </span>
                </figcaption>
              </figure>
            </div>
          ))}
          <div className="rec-spacer" aria-hidden="true" />
        </div>

        <div className="rec-controls">
          <div className="rec-arrows">
            <button
              type="button"
              className="rec-button"
              onClick={() => goTo(active - 1)}
              aria-label="Previous recommendation"
            >
              <Icon name="arrow-left" size={18} />
            </button>
            <button
              type="button"
              className="rec-button"
              onClick={() => goTo(active + 1)}
              aria-label="Next recommendation"
            >
              <Icon name="arrow-right" size={18} />
            </button>
          </div>

          <ol className="rec-dots" aria-label="Choose a recommendation">
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="rec-dot"
                  aria-label={`Recommendation ${index + 1}: ${item.name}`}
                  aria-current={index === active ? "true" : undefined}
                  onClick={() => goTo(index)}
                >
                  {index === active && autoplay ? (
                    <span
                      key={`${active}`}
                      className="rec-dot-fill"
                      onAnimationEnd={() => goTo(active + 1)}
                    />
                  ) : null}
                </button>
              </li>
            ))}
          </ol>

          <p className="rec-count type-data" aria-hidden="true">
            {pad2(active + 1)} / {pad2(count)}
          </p>

          {!reduced ? (
            <button
              type="button"
              className="rec-button rec-play"
              onClick={() => setPlaying((value) => !value)}
              aria-label={playing ? "Pause automatic rotation" : "Start automatic rotation"}
            >
              <Icon name={playing ? "pause" : "play"} size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {source ? (
        <p className="type-small mt-8">
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
            aria-label="All recommendations on LinkedIn (opens in a new tab)"
          >
            All recommendations on LinkedIn
          </a>
        </p>
      ) : null}
    </DocSection>
  );
}
