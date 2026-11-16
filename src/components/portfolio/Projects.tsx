import { DocSection } from "@/components/ui/DocSection";
import { pad2 } from "@/lib/utils";
import type { Project } from "@/types/portfolio";

interface ProjectsProps {
  projects: readonly Project[];
}

export function Projects({ projects }: ProjectsProps) {
  return (
    <DocSection
      id="projects"
      title="Selected projects"
      note="Client work is described without screenshots or links because it is confidential."
    >
      <ul className="grid gap-x-10 md:grid-cols-2">
        {projects.map((project) => (
          <li key={project.id} className="border-t border-line py-7">
            <article aria-labelledby={`project-${project.id}`}>
              <p className="type-label text-ink-muted">
                {project.client}
                {project.via ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    <span>via {project.via}</span>
                  </>
                ) : null}
              </p>
              <h3 id={`project-${project.id}`} className="mt-2 text-xl leading-snug font-bold">
                {project.name}
              </h3>
              <p className="mt-2 text-ink-muted">{project.summary}</p>
              <ul className="type-small mt-4 grid gap-1.5">
                {project.contributions.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden="true" className="mt-[0.7em] h-px w-3 shrink-0 bg-accent-ink" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="type-small mt-4">
                <a href={`#chapter-${pad2(project.chapter)}`} className="text-link">
                  See chapter {pad2(project.chapter)} of the career journey
                </a>
              </p>
            </article>
          </li>
        ))}
      </ul>
    </DocSection>
  );
}
