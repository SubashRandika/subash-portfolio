import { DocSection } from "@/components/ui/DocSection";
import { CareerTimeline } from "./CareerTimeline";
import { formatDate, pad2 } from "@/lib/utils";
import type { Chapter, Engagement, ExperienceEntry } from "@/types/portfolio";

interface ExperienceProps {
  entries: readonly ExperienceEntry[];
  /** The journey's chapters, for the links from each row to its story. */
  chapters: readonly Pick<Chapter, "number" | "title">[];
}

function Period({ entry }: { entry: ExperienceEntry }) {
  return (
    <span className="type-data text-[0.8125rem]">
      <span className="whitespace-nowrap">
        <time dateTime={entry.start}>{formatDate(entry.start)}</time>
        <span aria-hidden="true"> –</span>
      </span>
      <span className="sr-only"> to</span>{" "}
      <span className="whitespace-nowrap">
        {entry.end ? <time dateTime={entry.end}>{formatDate(entry.end)}</time> : "Present"}
      </span>
    </span>
  );
}

function EngagementList({ engagements }: { engagements: readonly Engagement[] }) {
  if (engagements.length === 0) return <span className="text-ink-muted">—</span>;
  return (
    <ul className="grid gap-1.5">
      {engagements.map((engagement) => (
        <li key={engagement.client}>
          <span className="font-bold">{engagement.client}</span>
          {engagement.product ? <span className="text-ink-muted"> — {engagement.product}</span> : null}
          {engagement.role ? (
            <span className="type-small block text-ink-muted">as {engagement.role}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Links from a row to the chapters of the career journey that tell it. */
function ChapterLinks({
  numbers,
  chapters,
}: {
  numbers: readonly number[];
  chapters: ExperienceProps["chapters"];
}) {
  return (
    <ul className="grid gap-1.5">
      {numbers.map((number) => {
        const chapter = chapters.find((item) => item.number === number);
        return (
          <li key={number}>
            <a href={`#chapter-${pad2(number)}`} className="text-link">
              <span className="type-data text-[0.8125rem]">Chapter {pad2(number)}</span>
              {chapter ? <span className="block">{chapter.title}</span> : null}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Full work experience as a compact logbook: when, what role, for which
 * employer and which clients. Employer and client have separate columns so
 * the two are never confused. What was built is told in the career journey
 * (each row links to its chapters) and in the résumé, so it is not repeated
 * here.
 */
export function Experience({ entries, chapters }: ExperienceProps) {
  return (
    <DocSection
      id="experience"
      title="Work experience"
      note="Employers and the clients or products I worked on are listed separately. What I built is told in the career journey."
      wide
    >
      <CareerTimeline entries={entries} />

      <table className="logbook">
        <caption className="sr-only">Work experience, most recent first</caption>
        <colgroup>
          <col data-col="period" />
          <col data-col="role" />
          <col data-col="employer" />
          <col data-col="client" />
          <col data-col="journey" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Role</th>
            <th scope="col">Employer</th>
            <th scope="col">Client / product</th>
            <th scope="col">In the career journey</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>
                <Period entry={entry} />
              </td>
              <th scope="row">{entry.role}</th>
              <td data-label="Employer">
                {entry.employer ?? (
                  <>
                    <span aria-hidden="true" className="text-ink-muted">—</span>
                    <span className="sr-only">Not listed</span>
                  </>
                )}
              </td>
              <td data-label="Client / product">
                <EngagementList engagements={entry.engagements} />
              </td>
              <td data-label="In the career journey">
                <ChapterLinks numbers={entry.chapters} chapters={chapters} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocSection>
  );
}
