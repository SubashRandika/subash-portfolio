import { DocSection } from "@/components/ui/DocSection";
import type { EducationEntry } from "@/types/portfolio";

interface EducationProps {
  entries: readonly EducationEntry[];
}

/**
 * Education. Renders nothing until real entries are supplied: a placeholder
 * would be an invented fact.
 */
export function Education({ entries }: EducationProps) {
  if (entries.length === 0) return null;

  return (
    <DocSection id="education" title="Education">
      <ul className="max-w-3xl">
        {entries.map((entry) => (
          <li
            key={`${entry.institution}-${entry.qualification}`}
            className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-t border-line py-5"
          >
            <div>
              <h3 className="text-lg font-bold">{entry.qualification}</h3>
              <p className="text-ink-muted">{entry.institution}</p>
            </div>
            {entry.period ? <p className="type-data text-[0.8125rem]">{entry.period}</p> : null}
          </li>
        ))}
      </ul>
    </DocSection>
  );
}
