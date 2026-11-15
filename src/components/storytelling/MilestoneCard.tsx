import { Icon } from "@/components/ui/Icon";
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

/** Element id of a milestone card; also the target of its HUD waypoint. */
export function milestoneId(chapter: ChapterNumber, milestone: Pick<Milestone, "id">): string {
  return `milestone-${chapter}-${milestone.id}`;
}

/** Whether a milestone has anything to show beyond its title. */
export function hasDetail(milestone: Milestone): boolean {
  return Boolean(milestone.summary || milestone.points?.length);
}

/**
 * One career milestone, styled after an air-traffic flight progress strip:
 * a narrow index field followed by the content field.
 *
 * The detail is always in the HTML. The static page shows it; during the
 * flight the strips are compact and a button opens each one (handled by the
 * flight director, so it costs nothing when the flight is not running).
 */
export function MilestoneCard({ milestone, chapter, position }: MilestoneCardProps) {
  const ref = waypointRef(chapter, position);
  const id = milestoneId(chapter, milestone);
  const detailId = `${id}-detail`;
  const detail = hasDetail(milestone);

  return (
    <li id={id} className="milestone" data-milestone={ref}>
      <div className="milestone-index" aria-hidden="true">
        <span className="type-data text-xs">{ref}</span>
      </div>
      <div className="milestone-body">
        {milestone.group ? (
          <p className="milestone-group type-label mb-1.5 text-accent-ink">{milestone.group}</p>
        ) : null}
        <div className="flex items-start justify-between gap-3">
          <h4 className="text-[1.0625rem] leading-snug font-bold">{milestone.title}</h4>
          {detail ? (
            <button
              type="button"
              className="milestone-toggle"
              aria-expanded="false"
              aria-controls={detailId}
              data-milestone-toggle
            >
              <Icon name="plus" className="size-4" />
              <span className="sr-only">Details: {milestone.title}</span>
            </button>
          ) : null}
        </div>
        {detail ? (
          <div id={detailId} className="milestone-detail">
            {milestone.summary ? (
              <p className="type-small mt-1.5 text-ink-muted">{milestone.summary}</p>
            ) : null}
            {milestone.points ? (
              <ul className="milestone-points type-small mt-3 border-t border-line pt-3">
                {milestone.points.map((point) => (
                  <li key={point} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-accent" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
