import type { CSSProperties, ReactNode } from "react";
import { spanOf } from "@/flight/timeline";
import { pad2 } from "@/lib/utils";
import type { Chapter } from "@/types/portfolio";
import { MilestoneCard } from "./MilestoneCard";

interface ChapterSectionProps {
  chapter: Chapter;
  totalChapters: number;
  /** Extra content shown after the milestones, e.g. the closing message. */
  children?: ReactNode;
}

/**
 * One career chapter of the flight.
 *
 * In static mode this is an ordinary block with a painted sky. In live mode
 * CSS makes it as tall as the chapter's share of the flight and pins its
 * panel, so the same markup serves both.
 */
export function ChapterSection({ chapter, totalChapters, children }: ChapterSectionProps) {
  const headingId = `${chapter.id}-title`;
  const style = { "--span": spanOf(chapter.number) } as CSSProperties;

  return (
    <article
      id={chapter.id}
      className="chapter"
      style={style}
      aria-labelledby={headingId}
      data-chapter={chapter.number}
    >
      <div className="chapter-backdrop sky" data-sky={chapter.number} aria-hidden="true" />
      <div className="chapter-panel">
        <div className="shell">
          <header className="max-w-2xl">
            <p className="type-label text-ink-muted">
              <span className="text-accent-ink">
                Chapter {pad2(chapter.number)}
                <span aria-hidden="true"> / {pad2(totalChapters)}</span>
              </span>
              <span aria-hidden="true" className="mx-3 inline-block h-px w-6 bg-line-strong align-middle" />
              {chapter.period}
            </p>
            <h3 id={headingId} className="type-display-lg mt-4">
              {chapter.title}
            </h3>
            <p className="mt-4 text-[1.0625rem] font-bold">
              {chapter.organisation}
              {chapter.product ? (
                <span className="font-normal text-ink-muted"> — {chapter.product}</span>
              ) : null}
            </p>
            <p className="type-lead mt-3 text-ink-muted">{chapter.narrative}</p>
          </header>

          <ol className="milestones">
            {chapter.milestones.map((milestone, index) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                chapter={chapter.number}
                position={index + 1}
              />
            ))}
          </ol>

          {children}
        </div>
      </div>
    </article>
  );
}
