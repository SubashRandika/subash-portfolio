import { DocSection } from "@/components/ui/DocSection";
import type { SkillGroup } from "@/types/portfolio";

interface SkillsProps {
  groups: readonly SkillGroup[];
}

export function Skills({ groups }: SkillsProps) {
  return (
    <DocSection id="expertise" title="Technical expertise">
      <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.id}>
            <h3 className="type-label text-ink-muted">{group.title}</h3>
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
