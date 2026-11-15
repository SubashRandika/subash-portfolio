import { FlightStage } from "@/components/flight/FlightStage";
import { ButtonLink } from "@/components/ui/Button";
import type { Chapter, Profile } from "@/types/portfolio";
import { ChapterNavigation } from "./ChapterNavigation";
import { ChapterSection } from "./ChapterSection";
import { FlightHUD } from "./FlightHUD";
import { Opening } from "./Opening";

interface FlightSectionProps {
  profile: Profile;
  chapters: readonly Chapter[];
}

/**
 * The Career Flight: opening, six chapters and the closing message.
 *
 * All of the narrative is server-rendered HTML in document order. The stage
 * (3D canvas and HUD) only becomes visible in live mode.
 */
export function FlightSection({ profile, chapters }: FlightSectionProps) {
  const [closingLead, closingFollow] = profile.closingMessage;
  const lastChapter = chapters[chapters.length - 1];

  return (
    <section id="flight" data-theme="night" className="flight" aria-labelledby="flight-heading">
      <div className="flight-stage">
        {/* Painted sky shown until the first 3D frame is ready. */}
        <div className="flight-poster sky" data-sky="0" aria-hidden="true">
          <div className="runway" />
        </div>
        <div className="absolute inset-0" aria-hidden="true">
          <FlightStage />
        </div>
        <FlightHUD chapters={chapters} profile={profile} />
      </div>

      <div className="flight-narrative">
        <Opening profile={profile} />

        <div className="flight-intro shell pt-14 pb-4">
          <h2 id="flight-heading" className="type-display-md">
            The Career Flight
          </h2>
          <p className="type-small mt-3 max-w-xl text-ink-muted">
            Six chapters, from the first takeoff in {profile.careerStartYear} to the current mission.
          </p>
          <div className="mt-8">
            <ChapterNavigation chapters={chapters} />
          </div>
        </div>

        {chapters.map((chapter) => (
          <ChapterSection key={chapter.id} chapter={chapter} totalChapters={chapters.length}>
            {chapter === lastChapter ? (
              <div className="flight-closing mt-14 max-w-3xl border-t border-line-strong pt-8">
                <p className="type-display-lg">{closingLead}</p>
                <p className="type-lead mt-3 text-accent-ink italic">{closingFollow}</p>
                <div className="mt-7">
                  <ButtonLink href="#contact" icon="arrow-down">
                    Get in touch
                  </ButtonLink>
                </div>
              </div>
            ) : null}
          </ChapterSection>
        ))}
      </div>
    </section>
  );
}
