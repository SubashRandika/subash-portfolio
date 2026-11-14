import { pad2 } from "@/lib/utils";
import type { Chapter } from "@/types/portfolio";

interface ChapterNavigationProps {
  chapters: readonly Chapter[];
}

/**
 * In-flow index of the six chapters. This is the chapter navigation for the
 * static experience; in live mode the HUD rail takes over.
 */
export function ChapterNavigation({ chapters }: ChapterNavigationProps) {
  return (
    <nav aria-label="Career chapters" className="chapter-index">
      <ol className="grid gap-x-10 md:grid-cols-2 xl:grid-cols-3">
        {chapters.map((chapter) => (
          <li key={chapter.id}>
            <a href={`#${chapter.id}`}>
              <span className="type-data text-xs text-accent-ink" aria-hidden="true">
                {pad2(chapter.number)}
              </span>
              <span>
                <span className="sr-only">Chapter {chapter.number}: </span>
                <span className="font-bold">{chapter.title}</span>
                <span className="type-small block text-ink-muted">{chapter.organisation}</span>
                <span className="type-label mt-1.5 block text-ink-muted">{chapter.period}</span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
