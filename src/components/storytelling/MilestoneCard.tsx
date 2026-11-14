import type { ChapterNumber } from "@/flight/timeline";
import type { Milestone } from "@/types/portfolio";

interface MilestoneCardProps {
  milestone: Milestone;
  chapter: ChapterNumber;
  /** 1-based position of the milestone within its chapter. */
  position: number;
}

/** Waypoint reference shown on the card and on the HUD rail, e.g. "5.3". */
export function waypointRef(chapter: ChapterNumber, position: number): string {
  return `${chapter}.${position}`;
}

/**
 * One career milestone, styled after an air-traffic flight progress strip:
 * a narrow index field followed by the content field.
 */
export function MilestoneCard({ milestone, chapter, position }: MilestoneCardProps) {
  const ref = waypointRef(chapter, position);
  return (
    <li
      id={`${chapter}-${milestone.id}`}
      className="milestone"
      data-milestone={ref}
    >
      <div className="milestone-index" aria-hidden="true">
        <span className="type-data text-xs">{ref}</span>
      </div>
      <div className="milestone-body">
        {milestone.group ? (
          <p className="type-label mb-1.5 text-accent-ink">{milestone.group}</p>
        ) : null}
        <h4 className="text-[1.0625rem] leading-snug font-bold">{milestone.title}</h4>
        {milestone.summary ? (
          <p className="type-small mt-1.5 text-ink-muted">{milestone.summary}</p>
        ) : null}
        {milestone.points ? (
          <ul className="type-small mt-3 grid gap-1 border-t border-line pt-3">
            {milestone.points.map((point) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
