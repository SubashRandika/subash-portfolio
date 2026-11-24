import { type CSSProperties, Fragment } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { spanOf } from "@/flight/timeline";
import type { ResumeFile } from "@/lib/resume";
import type { Profile } from "@/types/portfolio";
import { FilmStill } from "./FilmStill";
import { ResumeDownload } from "./ResumeDownload";

interface OpeningProps {
  profile: Profile;
  resume?: ResumeFile | null;
}

/** Order of a staged element, read by the entrance animations in CSS. */
const order = (index: number) => ({ "--i": index }) as CSSProperties;

/**
 * The tagline, one span per word so each can come into focus in turn. The
 * spaces stay as text between the spans, so the sentence reads and is
 * found exactly as written.
 */
function Words({ text }: { text: string }) {
  return text.split(" ").map((word, index) => (
    <Fragment key={index}>
      {index > 0 ? " " : null}
      <span className="hero-word" style={order(index)}>
        {word}
      </span>
    </Fragment>
  ));
}

/** The follow-up line, with any year picked out and underlined. */
function Follow({ text }: { text: string }) {
  return text.split(/(\d{4})/).map((part, index) =>
    /^\d{4}$/.test(part) ? (
      <span key={index} className="hero-year">
        {part}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

/**
 * The opening of the page and of the flight: tagline first, then name and
 * title. This is server-rendered text, so it is the page's largest paint and
 * is readable before any of the film loads.
 *
 * Entrance (CSS, skipped for reduced motion): the tagline's words come into
 * focus one after another and a band of dawn light passes across them; the
 * year is underlined; the rule draws in like a horizon; the name rises into
 * place; the actions follow.
 */
export function Opening({ profile, resume = null }: OpeningProps) {
  const style = { "--span": spanOf(0) } as CSSProperties;
  const [taglineLead, taglineFollow] = profile.tagline;

  return (
    <header id="takeoff" className="opening" style={style}>
      <div className="chapter-backdrop sky" data-sky="0" aria-hidden="true">
        <FilmStill clip={0} className="chapter-still" priority />
      </div>

      <div className="opening-panel">
        <div
          className="opening-copy shell pt-[calc(var(--header-height)+2rem)] pb-[clamp(2.5rem,8vh,5.5rem)]"
          data-flight-part="opening"
        >
          <p className="hero-tagline type-display-xl max-w-[18ch]">
            <Words text={taglineLead} />
          </p>
          <p className="hero-follow type-lead mt-4 text-accent-ink italic" data-opening="follow">
            <Follow text={taglineFollow} />
          </p>

          <div className="opening-identity mt-10 pt-6" data-opening="identity">
            <h1>
              <span className="hero-name-clip">
                <span className="hero-name">{profile.name}</span>
              </span>
              <span className="hero-role type-label mt-3 block">
                {profile.title}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {profile.yearsOfExperience} years of experience
              </span>
            </h1>

            <div className="opening-actions">
              <span className="hero-action" style={order(0)}>
                <ButtonLink href="#chapter-01" icon="arrow-down">
                  Begin the journey
                </ButtonLink>
              </span>
              {resume ? (
                <span className="hero-action" style={order(1)}>
                  <ResumeDownload file={resume} />
                </span>
              ) : null}
              <span className="hero-action" style={order(2)}>
                <ButtonLink href="#about" variant="quiet">
                  Skip to portfolio
                </ButtonLink>
              </span>
            </div>
          </div>

          <p className="hero-hint live-only type-label mt-5 text-ink-muted" data-opening="hint">
            <span className="hero-hint-track" aria-hidden="true" />
            Scroll to explore at your own pace
          </p>
        </div>
      </div>
    </header>
  );
}
