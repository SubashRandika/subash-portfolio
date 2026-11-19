"use client";

import Image from "next/image";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  TECH_FAMILIES,
  type TechFamily,
  type Technology,
  techIconPath,
} from "@/data/technologies";
import { pad2 } from "@/lib/utils";

interface TechTableProps {
  technologies: readonly Technology[];
}

type Filter = TechFamily | "all";

/** Tiles enter in a cascade, at most this long in total. */
const CASCADE_MS = 900;

/** True if the media query matches; false where media queries are unavailable. */
function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * Holds the table back until it scrolls into view, then reveals it once.
 * Shown at once when motion is reduced, when it is already on screen, or
 * where IntersectionObserver is unavailable.
 */
function reveal(table: HTMLElement): () => void {
  const box = table.getBoundingClientRect();
  const onScreen = box.top < window.innerHeight && box.bottom > 0;
  if (matches("(prefers-reduced-motion: reduce)") || onScreen || !("IntersectionObserver" in window)) {
    table.dataset.reveal = "shown";
    return () => undefined;
  }
  table.dataset.reveal = "pending";
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      table.dataset.reveal = "shown";
      observer.disconnect();
    },
    { threshold: 0.12 },
  );
  observer.observe(table);
  return () => observer.disconnect();
}

/**
 * The technologies as a periodic table: one tile per technology with its
 * number, symbol, icon and name, coloured by family. The core stack has
 * larger tiles. The legend doubles as a filter that brings one family
 * forward.
 */
export function TechTable({ technologies }: TechTableProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return reveal(ref.current);
  }, []);

  const count = (family: Filter) =>
    family === "all" ? technologies.length : technologies.filter((tech) => tech.family === family).length;
  const shown = filter === "all" ? null : TECH_FAMILIES.find((family) => family.id === filter);
  const step = Math.min(24, CASCADE_MS / technologies.length);

  return (
    <div ref={ref} className="tech-table" data-filter={filter}>
      <div className="tech-legend" role="group" aria-label="Highlight a family of technologies">
        {(["all", ...TECH_FAMILIES.map((family) => family.id)] as Filter[]).map((id) => {
          const family = TECH_FAMILIES.find((f) => f.id === id);
          return (
            <button
              key={id}
              type="button"
              className="tech-legend-item"
              data-family={id}
              aria-pressed={filter === id}
              onClick={() => setFilter(filter === id && id !== "all" ? "all" : id)}
            >
              <span className="tech-legend-swatch" aria-hidden="true" />
              {family ? family.title : "All"}
              <span className="tech-legend-count">{count(id)}</span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {shown ? `Highlighting ${count(filter)} ${shown.title.toLowerCase()} technologies.` : ""}
      </p>

      <ol className="tech-grid" aria-label="Technologies">
        {technologies.map((tech, index) => (
          <li
            key={tech.id}
            className="tech-tile"
            data-family={tech.family}
            data-core={tech.core ? "true" : undefined}
            data-dimmed={filter !== "all" && tech.family !== filter ? "true" : undefined}
            style={{ "--delay": `${Math.round(index * step)}ms` } as CSSProperties}
          >
            <span className="tech-number" aria-hidden="true">
              {pad2(index + 1)}
            </span>
            <span className="tech-symbol" aria-hidden="true">
              {tech.symbol}
            </span>
            {tech.icon ? (
              <Image
                className="tech-icon"
                src={techIconPath(tech.icon)}
                alt=""
                width={48}
                height={48}
                loading="lazy"
                unoptimized
              />
            ) : (
              <span className="tech-icon tech-icon-symbol" aria-hidden="true">
                {tech.symbol}
              </span>
            )}
            <span className="tech-name">{tech.name}</span>
            {tech.core ? <span className="tech-core">Core</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
