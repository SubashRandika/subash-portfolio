"use client";

import Image, { type StaticImageData } from "next/image";
import { type CSSProperties, useEffect, useRef } from "react";
import aeroShield from "@/assets/projects/aero-shield.webp";
import crownClothing from "@/assets/projects/crown-clothing.webp";
import dreamHaus from "@/assets/projects/dream-haus.webp";
import lumora from "@/assets/projects/lumora.webp";
import motioCode from "@/assets/projects/motio-code.webp";
import sinhaGiri from "@/assets/projects/sinha-giri.webp";
import { DocSection } from "@/components/ui/DocSection";
import { Icon } from "@/components/ui/Icon";
import { pad2 } from "@/lib/utils";
import type { OpenSourceProject } from "@/types/portfolio";

/** Screenshots of the live demos, by repository. */
const SHOTS: Record<string, StaticImageData> = {
  "sinha-giri": sinhaGiri,
  lumora,
  "dream-haus": dreamHaus,
  "motio-code": motioCode,
  "aero-shield": aeroShield,
  "crown-clothing": crownClothing,
};

/** Largest tilt of a card under the pointer, in degrees. */
const MAX_TILT = 4;

function matches(query: string): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

/**
 * Holds the cards back until the grid scrolls into view, then reveals them
 * once. Shown at once when motion is reduced, when the grid is already on
 * screen, or where IntersectionObserver is unavailable.
 */
function reveal(grid: HTMLElement, reduced: boolean): () => void {
  const box = grid.getBoundingClientRect();
  const onScreen = box.top < window.innerHeight && box.bottom > 0;
  if (reduced || onScreen || !("IntersectionObserver" in window)) {
    grid.dataset.reveal = "shown";
    return () => undefined;
  }
  grid.dataset.reveal = "pending";
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      grid.dataset.reveal = "shown";
      observer.disconnect();
    },
    { threshold: 0.12 },
  );
  observer.observe(grid);
  return () => observer.disconnect();
}

/**
 * Tilts a card's window toward a fine pointer and moves the sheen with it.
 * Written to CSS custom properties, never React state.
 */
function tiltWithPointer(card: HTMLElement): () => void {
  let frame = 0;
  const tilt = (x: number, y: number, active: boolean) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      card.style.setProperty("--tilt-x", `${(x * MAX_TILT * 2).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(-y * MAX_TILT * 2).toFixed(2)}deg`);
      card.style.setProperty("--sheen-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      card.style.setProperty("--sheen-y", `${((y + 0.5) * 100).toFixed(1)}%`);
      card.dataset.tilting = active ? "true" : "false";
    });
  };
  const clampHalf = (value: number) => Math.max(-0.5, Math.min(0.5, value));
  const onMove = (event: PointerEvent) => {
    const rect = card.getBoundingClientRect();
    tilt(
      clampHalf((event.clientX - rect.left) / rect.width - 0.5),
      clampHalf((event.clientY - rect.top) / rect.height - 0.5),
      true,
    );
  };
  const onLeave = () => tilt(0, 0, false);
  card.addEventListener("pointermove", onMove);
  card.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    card.removeEventListener("pointermove", onMove);
    card.removeEventListener("pointerleave", onLeave);
  };
}

function animate(grid: HTMLElement): () => void {
  const reduced = matches("(prefers-reduced-motion: reduce)");
  const stops = [reveal(grid, reduced)];
  if (!reduced && matches("(hover: hover) and (pointer: fine)")) {
    for (const card of grid.querySelectorAll<HTMLElement>(".oss-card")) {
      stops.push(tiltWithPointer(card));
    }
  }
  return () => stops.forEach((stop) => stop());
}

/** "https://dream-haus.vercel.app" → "dream-haus.vercel.app" */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface OpenSourceProps {
  projects: readonly OpenSourceProject[];
  /** The GitHub profile, for the link to everything else. */
  profile: string | null;
}

/**
 * Personal projects pinned on GitHub, each a small browser window showing
 * its live demo. The whole card opens the demo in a new tab; the source link
 * opens the repository. On first view the cards rise in turn and each screen
 * switches on like a monitor; a fine pointer tilts the window it is over.
 */
export function OpenSource({ projects, profile }: OpenSourceProps) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return animate(ref.current);
  }, []);

  return (
    <DocSection
      id="open-source"
      title="Personal projects"
      note="Open source, built in my own time. Open a card to try the live demo."
      wide
    >
      <ul ref={ref} className="oss-grid">
        {projects.map((project, index) => {
          const titleId = `oss-${project.repo}`;
          const shot = SHOTS[project.repo];
          return (
            <li
              key={project.repo}
              className="oss-card"
              style={{ "--i": index, "--project-accent": project.accent } as CSSProperties}
            >
              <article aria-labelledby={titleId} className="oss-article">
                <div className="oss-window">
                  <div className="oss-bar" aria-hidden="true">
                    <span className="oss-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span className="oss-url">{hostOf(project.demo)}</span>
                    <span className="oss-live">Live</span>
                  </div>
                  <div className="oss-screen">
                    {shot ? (
                      <Image
                        src={shot}
                        alt={project.shot}
                        placeholder="blur"
                        quality={90}
                        sizes="(min-width: 80rem) 25rem, (min-width: 48rem) 46vw, 92vw"
                        className="oss-shot"
                      />
                    ) : null}
                    <span className="oss-sheen" aria-hidden="true" />
                  </div>
                </div>

                <div className="oss-body">
                  <p className="oss-meta type-label">
                    <span className="oss-index">{pad2(index + 1)}</span>
                    <span>Open source · {project.year}</span>
                  </p>
                  <h3 id={titleId} className="oss-title">
                    <a
                      href={project.demo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="oss-link"
                      aria-label={`${project.name}, live demo (opens in a new tab)`}
                    >
                      {project.name}
                    </a>
                  </h3>
                  <p className="oss-summary">{project.summary}</p>
                  <ul className="oss-stack" aria-label="Built with">
                    {project.stack.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="oss-actions">
                    <span className="oss-open" aria-hidden="true">
                      Live demo
                      <Icon name="arrow-up-right" size={16} />
                    </span>
                    <a
                      href={project.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="oss-source"
                      aria-label={`Source of ${project.name} on GitHub (opens in a new tab)`}
                    >
                      <Icon name="github" size={16} />
                      Source
                    </a>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>

      {profile ? (
        <p className="type-small mt-10">
          <a href={profile} target="_blank" rel="noopener noreferrer" className="text-link">
            More of my work on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      ) : null}
    </DocSection>
  );
}
