import type { CSSProperties } from "react";
import { pad2, formatDate } from "@/lib/utils";
import type { ExperienceEntry } from "@/types/portfolio";

interface CareerTimelineProps {
  entries: readonly ExperienceEntry[];
}

const DAY = 86_400_000;

/**
 * Share of the track given to the current, open-ended role beyond its start.
 * It is drawn fading out rather than to a date, because the page is built
 * ahead of time and cannot know today's date.
 */
const OPEN_TAIL = 0.16;

export interface TimelineRow {
  entry: ExperienceEntry;
  /** Left edge and width as fractions of the track. */
  left: number;
  width: number;
  open: boolean;
}

/** Lays the entries out on a shared time axis, oldest first. */
export function layoutTimeline(entries: readonly ExperienceEntry[]): {
  rows: TimelineRow[];
  years: { year: number; at: number }[];
} {
  const sorted = [...entries].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (sorted.length === 0) return { rows: [], years: [] };
  const first = Date.parse(sorted[0]!.start);
  const known = sorted.flatMap((e) => [Date.parse(e.start), e.end ? Date.parse(e.end) + DAY : 0]);
  const last = Math.max(...known);
  const span = Math.max(last - first, DAY);
  const scale = (1 - OPEN_TAIL) / span;
  const at = (time: number) => (time - first) * scale;

  const rows = sorted.map((entry) => {
    const start = at(Date.parse(entry.start));
    const end = entry.end ? at(Date.parse(entry.end) + DAY) : 1;
    return { entry, left: start, width: Math.max(end - start, 0.006), open: entry.end === null };
  });

  const years: { year: number; at: number }[] = [];
  const firstYear = new Date(first).getUTCFullYear() + 1;
  const lastYear = new Date(last).getUTCFullYear();
  for (let year = firstYear; year <= lastYear; year++) {
    years.push({ year, at: at(Date.UTC(year, 0, 1)) });
  }
  return { rows, years };
}

/**
 * The career at a glance: one row per employment, on a shared time axis.
 * Every date comes from the experience data; the current role runs on to
 * "Present".
 */
export function CareerTimeline({ entries }: CareerTimelineProps) {
  const { rows, years } = layoutTimeline(entries);
  if (rows.length === 0) return null;

  return (
    <figure className="timeline" aria-labelledby="career-timeline-title">
      <figcaption id="career-timeline-title" className="type-label text-ink-muted">
        Career timeline
      </figcaption>

      <ol className="timeline-rows">
        {rows.map(({ entry, left, width, open }) => {
          const style = { "--left": left, "--width": width } as CSSProperties;
          const clients = entry.engagements.map((e) => e.client).join(", ");
          // Where no employer is named, the clients lead the row.
          const organisation = entry.employer ?? clients;
          const others = entry.employer ? clients : "";
          return (
            <li key={entry.id} className="timeline-row">
              <div className="timeline-label">
                <span className="font-bold">{organisation}</span>
                {others ? <span className="text-ink-muted"> · {others}</span> : null}
                <span className="type-small block text-ink-muted">
                  {entry.role}
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  <time dateTime={entry.start} className="whitespace-nowrap">
                    {formatDate(entry.start)}
                  </time>
                  <span aria-hidden="true"> – </span>
                  <span className="sr-only"> to </span>
                  {entry.end ? (
                    <time dateTime={entry.end} className="whitespace-nowrap">
                      {formatDate(entry.end)}
                    </time>
                  ) : (
                    "Present"
                  )}
                </span>
              </div>
              <div className="timeline-track" aria-hidden="true">
                <span className="timeline-bar" data-open={open || undefined} style={style} />
              </div>
              <div className="timeline-chapters">
                {entry.chapters.map((n) => (
                  <a key={n} href={`#chapter-${pad2(n)}`} className="tag">
                    <span className="sr-only">Career journey chapter </span>
                    <span aria-hidden="true">Ch. </span>
                    {pad2(n)}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="timeline-row timeline-axis-row" aria-hidden="true">
        <span />
        <div className="timeline-axis">
          {years.map(({ year, at }, index) => (
            // Narrow screens label every third year, clear of "Present".
            <span key={year} style={{ "--at": at } as CSSProperties} data-sparse={index % 3 === 0 || undefined}>
              {year}
            </span>
          ))}
          <span className="timeline-present">Present</span>
        </div>
        <span />
      </div>
    </figure>
  );
}
