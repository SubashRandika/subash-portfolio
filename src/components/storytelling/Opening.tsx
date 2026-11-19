import type { CSSProperties } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { spanOf } from "@/flight/timeline";
import type { ResumeFile } from "@/lib/resume";
import type { Profile } from "@/types/portfolio";
import { ResumeDownload } from "./ResumeDownload";

interface OpeningProps {
  profile: Profile;
  resume?: ResumeFile | null;
}

/**
 * The opening of the page and of the flight: tagline first, then name and
 * title. This is server-rendered text, so it is the page's largest paint and
 * is readable before any 3D loads.
 */
export function Opening({ profile, resume = null }: OpeningProps) {
  const style = { "--span": spanOf(0) } as CSSProperties;
  const [taglineLead, taglineFollow] = profile.tagline;

  return (
    <header id="takeoff" className="opening" style={style}>
      <div className="chapter-backdrop sky" data-sky="0" aria-hidden="true" />
      <div className="runway" aria-hidden="true" />

      <div className="opening-panel">
        <div
          className="shell pt-[calc(var(--header-height)+2rem)] pb-[clamp(2.5rem,8vh,5.5rem)]"
          data-flight-part="opening"
        >
          <p className="type-display-xl max-w-[18ch]">{taglineLead}</p>
          <p className="type-lead mt-4 text-accent-ink italic" data-opening="follow">
            {taglineFollow}
          </p>

          <div
            className="opening-identity mt-10 border-t border-line-strong pt-6"
            data-opening="identity"
          >
            <h1>
              <span className="type-display-md block">{profile.name}</span>
              <span className="type-label mt-2 block text-ink-muted">
                {profile.title}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {profile.yearsOfExperience} years of experience
              </span>
            </h1>

            <div className="opening-actions">
              <ButtonLink href="#chapter-01" icon="arrow-down">
                Begin the journey
              </ButtonLink>
              {resume ? <ResumeDownload file={resume} /> : null}
              <ButtonLink href="#about" variant="quiet">
                Skip to portfolio
              </ButtonLink>
            </div>
          </div>

          <p className="live-only type-label mt-5 text-ink-muted" data-opening="hint">
            Scroll to explore at your own pace
          </p>
        </div>
      </div>
    </header>
  );
}
