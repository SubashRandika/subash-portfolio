"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { DocSection } from "@/components/ui/DocSection";
import { Icon } from "@/components/ui/Icon";
import { pad2 } from "@/lib/utils";
import type { Recommendation } from "@/types/portfolio";

/** How long each recommendation stays in the centre before the next, in ms. */
export const ADVANCE_MS = 8000;

/** Horizontal travel, in px, that counts as a swipe. */
const SWIPE_PX = 40;

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

/**
 * Where a card sits relative to the centre, wrapping round so the row loops:
 * 0 is the centre, -1 and 1 its neighbours, further out are hidden.
 */
export function offsetFrom(index: number, active: number, count: number): number {
  const half = Math.floor(count / 2);
  return ((((index - active + half) % count) + count) % count) - half;
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
 * Recommendations from LinkedIn as a looping carousel: three cards in view,
 * the one in the centre in focus, its neighbours smaller and faded either
 * side. It moves on by itself (a bar fills the current dot) and pauses while
 * the pointer or focus is on it, while a full text is open, when it is off
 * screen or the tab is hidden, or when the visitor presses Pause. Arrows,
 * dots, swiping and clicking a side card all move it. "Read the full
 * recommendation" opens the whole text in a reading panel (a dialog) with
 * previous and next, so the cards never change size. Reduced motion: it
 * never moves by itself and cards change without sliding.
 *
 * Only the centre card can be reached by keyboard or screen reader (the
 * others are inert); the arrows and dots bring any card to the centre.
 */
export function Recommendations({ items, source }: RecommendationsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // The recommendation open in the reading panel, if any.
  const [reading, setReading] = useState<number | null>(null);
  const readerRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const count = items.length;
  const autoplay = !reduced && playing;
  const running = autoplay && !hovered && !focused && reading === null && visible && !tabHidden;

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

  const goTo = useCallback(
    (index: number) => {
      if (count === 0) return;
      setActive(((index % count) + count) % count);
    },
    [count],
  );

  // Open or close the reading panel as `reading` changes. A modal dialog
  // where the browser supports it (focus is held inside, Esc closes it, the
  // page behind is inert); a plain open dialog otherwise.
  useEffect(() => {
    const dialog = readerRef.current;
    if (!dialog) return;
    if (reading !== null && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (reading === null && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [reading]);

  /** Reads another recommendation in the panel; the carousel follows. */
  const readAt = useCallback(
    (index: number) => {
      const target = ((index % count) + count) % count;
      setReading(target);
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
          className="rec-track"
          // Announce changes only when the visitor makes them.
          aria-live={running ? "off" : "polite"}
          onPointerDown={(event) => {
            swipeRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(event.clientY - start.y)) {
              goTo(active + (dx < 0 ? 1 : -1));
            }
          }}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        >
          {items.map((item, index) => {
            const offset = offsetFrom(index, active, count);
            const centre = offset === 0;
            return (
              <div
                key={item.id}
                className="rec-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${item.name}`}
                aria-hidden={centre ? undefined : true}
                data-offset={Math.max(-2, Math.min(2, offset))}
                data-active={centre ? "true" : undefined}
                style={{ "--o": offset } as CSSProperties}
                // A side card comes to the centre when clicked.
                onClick={centre ? undefined : () => goTo(index)}
              >
                <figure className="rec-card" inert={!centre}>
                  <span className="rec-mark" aria-hidden="true">
                    “
                  </span>
                  <blockquote className="rec-excerpt">
                    <p>{item.excerpt}</p>
                  </blockquote>
                  <button
                    type="button"
                    className="rec-read"
                    aria-haspopup="dialog"
                    onClick={() => setReading(index)}
                  >
                    <span className="rec-read-icon" aria-hidden="true" />
                    Read the full recommendation
                  </button>
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
            );
          })}
        </div>

        <div className="rec-controls">
          <button
            type="button"
            className="rec-button"
            onClick={() => goTo(active - 1)}
            aria-label="Previous recommendation"
          >
            <Icon name="arrow-left" size={18} />
          </button>

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

          <button
            type="button"
            className="rec-button"
            onClick={() => goTo(active + 1)}
            aria-label="Next recommendation"
          >
            <Icon name="arrow-right" size={18} />
          </button>

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

        <p className="rec-count type-data" aria-hidden="true">
          {pad2(active + 1)} / {pad2(count)}
        </p>
      </div>

      {source ? (
        <p className="type-small mt-8 text-center">
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
      <dialog
        ref={readerRef}
        className="rec-reader"
        aria-labelledby="rec-reader-name"
        onClose={() => {
          setReading(null);
          // Back to the card now in the centre (Previous and Next may have
          // moved on from the one that opened the panel, which is now inert).
          requestAnimationFrame(() =>
            rootRef.current?.querySelector<HTMLElement>(".rec-slide[data-active] .rec-read")?.focus(),
          );
        }}
        // A click on the dimmed backdrop (the dialog itself, outside its
        // sheet) closes it.
        onClick={(event) => {
          if (event.target === event.currentTarget) setReading(null);
        }}
      >
        {reading !== null && items[reading] ? (
          <article className="rec-sheet">
            <header className="rec-sheet-head">
              <span className="rec-monogram" aria-hidden="true">
                {initialsOf(items[reading].name)}
              </span>
              <span className="rec-who">
                <span id="rec-reader-name" className="rec-name">
                  {items[reading].name}
                </span>
                <span className="rec-headline">{items[reading].headline}</span>
                <span className="rec-relation">
                  {items[reading].relationship} ·{" "}
                  <time dateTime={items[reading].date}>{monthYear(items[reading].date)}</time>
                </span>
              </span>
              <button
                type="button"
                className="rec-button rec-sheet-close"
                onClick={() => setReading(null)}
                aria-label="Close"
                autoFocus
              >
                <Icon name="close" size={18} />
              </button>
            </header>

            <blockquote className="rec-sheet-text" key={items[reading].id}>
              {items[reading].text.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </blockquote>

            <footer className="rec-sheet-foot">
              <button
                type="button"
                className="rec-sheet-step"
                onClick={() => readAt(reading - 1)}
                aria-label={`Previous: ${items[(reading - 1 + count) % count]!.name}`}
              >
                <Icon name="arrow-left" size={16} />
                Previous
              </button>
              <span className="rec-count type-data" aria-hidden="true">
                {pad2(reading + 1)} / {pad2(count)}
              </span>
              <button
                type="button"
                className="rec-sheet-step"
                onClick={() => readAt(reading + 1)}
                aria-label={`Next: ${items[(reading + 1) % count]!.name}`}
              >
                Next
                <Icon name="arrow-right" size={16} />
              </button>
            </footer>
          </article>
        ) : null}
      </dialog>
    </DocSection>
  );
}
