import { DocSection } from "@/components/ui/DocSection";
import { CareerTimeline } from "./CareerTimeline";
import { formatDate } from "@/lib/utils";
import type { Engagement, ExperienceEntry } from "@/types/portfolio";

interface ExperienceProps {
  entries: readonly ExperienceEntry[];
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
          {engagement.period ? (
            <span className="type-data ml-2 text-[0.8125rem] text-ink-muted">{engagement.period}</span>
          ) : null}
          {engagement.role ? (
            <span className="type-small block text-ink-muted">as {engagement.role}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Full work experience as a logbook. Employer and client have separate
 * columns so the two are never confused.
 */
export function Experience({ entries }: ExperienceProps) {
  return (
    <DocSection
      id="experience"
      title="Work experience"
      note="Employers and the clients or products I worked on are listed separately."
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
          <col data-col="work" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Role</th>
            <th scope="col">Employer</th>
            <th scope="col">Client / product</th>
            <th scope="col">Work</th>
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
              <td data-label="Work">
                <ul className="type-small grid gap-1.5">
                  {entry.highlights.map((highlight) => (
                    <li key={highlight} className="flex gap-2.5">
                      <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-accent-ink" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DocSection>
  );
}
