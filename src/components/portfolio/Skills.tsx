import { DocSection } from "@/components/ui/DocSection";
import type { Technology } from "@/data/technologies";
import type { SkillGroup } from "@/types/portfolio";
import { TechTable } from "./TechTable";

interface SkillsProps {
  technologies: readonly Technology[];
  /** Practices: architecture, quality, leadership, ways of working. */
  groups: readonly SkillGroup[];
}

export function Skills({ technologies, groups }: SkillsProps) {
  return (
    <DocSection
      id="expertise"
      title="Technical expertise"
      note="The technologies I have built with, as a periodic table. The core stack has the large tiles."
    >
      <TechTable technologies={technologies} />

      <h3 className="type-label mt-14 text-ink-muted">Practices</h3>
      <div className="mt-5 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.id}>
            <h4 className="font-bold">{group.title}</h4>
            <ul className="mt-3 flex flex-wrap gap-2">
              {group.skills.map((skill) => (
                <li key={skill} className="tag">
                  {skill}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </DocSection>
  );
}
