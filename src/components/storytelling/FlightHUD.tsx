import type { CSSProperties } from "react";
import { OPENING_RANGE, type TimelineSegment, clamp01 } from "@/flight/timeline";
import { pad2 } from "@/lib/utils";
import type { Chapter, Profile } from "@/types/portfolio";

interface FlightHUDProps {
  chapters: readonly Chapter[];
  profile: Pick<Profile, "yearsOfExperience">;
  /** Segment shown as current. 0 is the takeoff sequence. */
  segment?: TimelineSegment;
  /** Flight progress, 0–1. */
  progress?: number;
}

/** "034" style readout so the width never changes while scrolling. */
export function formatProgress(progress: number): string {
  return String(Math.round(clamp01(progress) * 100)).padStart(3, "0");
}

/**
 * The persistent flight HUD.
 *
 * Rendered with initial values on the server. Elements that change during the
 * flight carry `data-hud` hooks; the flight controller updates them directly
 * instead of re-rendering React on every scroll frame.
 */
export function FlightHUD({ chapters, profile, segment = 0, progress = 0 }: FlightHUDProps) {
  const current = chapters.find((chapter) => chapter.number === segment);
  const total = chapters.length;
  const railStyle = { "--progress": clamp01(progress) } as CSSProperties;

  return (
    <div className="hud" data-hud="root">
      <div className="shell">
        <nav aria-label="Flight chapters" className="hud-rail" style={railStyle}>
          <span className="hud-rail-track" aria-hidden="true">
            <span className="hud-rail-fill" data-hud="fill" />
          </span>
          <ol>
            <li style={{ "--at": OPENING_RANGE[0] } as CSSProperties}>
              <a
                href="#takeoff"
                data-hud-segment={0}
                aria-current={segment === 0 ? "step" : undefined}
              >
                <span aria-hidden="true">T/O</span>
                <span className="sr-only">Takeoff</span>
              </a>
            </li>
            {chapters.map((chapter) => (
              <li key={chapter.id} style={{ "--at": chapter.range[0] } as CSSProperties}>
                <a
                  href={`#${chapter.id}`}
                  data-hud-segment={chapter.number}
                  data-passed={chapter.number < segment ? "true" : undefined}
                  aria-current={chapter.number === segment ? "step" : undefined}
                >
                  <span aria-hidden="true">{pad2(chapter.number)}</span>
                  <span className="sr-only">
                    Chapter {chapter.number}: {chapter.title}, {chapter.period}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <dl className="hud-strip">
          <div className="hud-field" data-priority="2">
            <dt>SR-01</dt>
            <dd>Career Flight</dd>
          </div>
          <div className="hud-field" data-priority="1">
            <dt data-hud="chapter-count">
              {current ? `${pad2(current.number)} / ${pad2(total)}` : "Takeoff"}
            </dt>
            <dd data-hud="chapter-title">{current ? current.title : "Runway"}</dd>
          </div>
          <div className="hud-field" data-priority="2">
            <dt>Dest</dt>
            <dd data-hud="destination">{current ? current.destination : chapters[0]?.destination}</dd>
          </div>
          <div className="hud-field" data-priority="3">
            <dt>Exp</dt>
            <dd>{profile.yearsOfExperience} yrs</dd>
          </div>
          <div className="hud-field" data-priority="1" data-field="progress">
            <dt className="sr-only">Flight progress</dt>
            <dd className="type-data">
              <span data-hud="percent">{formatProgress(progress)}</span>
              <span aria-hidden="true"> %</span>
              <span className="sr-only"> percent</span>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
