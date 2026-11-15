import type { CSSProperties } from "react";
import { OPENING_RANGE, type TimelineSegment, clamp01 } from "@/flight/timeline";
import { chapterBeats } from "@/flight/waypoints";
import { pad2 } from "@/lib/utils";
import type { Chapter, Profile } from "@/types/portfolio";
import { milestoneId, waypointRef } from "./MilestoneCard";

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

/** Readout shown for the takeoff sequence, before chapter 1. */
export const TAKEOFF_READOUT = { count: "Takeoff", title: "Runway" } as const;

/**
 * The persistent flight HUD.
 *
 * Rendered with initial values on the server. Elements that change during the
 * flight carry `data-hud` hooks, and each chapter link carries the readout
 * text for its chapter; the flight director updates them directly instead of
 * re-rendering React on every scroll frame.
 */
export function FlightHUD({ chapters, profile, segment = 0, progress = 0 }: FlightHUDProps) {
  const current = chapters.find((chapter) => chapter.number === segment);
  const total = chapters.length;
  const railStyle = { "--progress": clamp01(progress) } as CSSProperties;
  const firstDestination = chapters[0]?.destination ?? "";

  return (
    <div className="hud" data-hud="root">
      <div className="shell">
        <nav aria-label="Flight chapters" className="hud-rail" data-hud="rail" style={railStyle}>
          <span className="hud-rail-track" aria-hidden="true">
            <span className="hud-rail-fill" />
          </span>

          {/* Milestone waypoints: a pointer shortcut. The milestone cards are
              the accessible route to the same places. */}
          <ul className="hud-waypoints" aria-hidden="true">
            {chapters.flatMap((chapter) => {
              const beats = chapterBeats(chapter.number, chapter.milestones.length);
              return chapter.milestones.map((milestone, index) => (
                <li
                  key={`${chapter.id}-${milestone.id}`}
                  style={{ "--at": beats.milestones[index] } as CSSProperties}
                >
                  <a
                    href={`#${milestoneId(chapter.number, milestone)}`}
                    tabIndex={-1}
                    title={milestone.title}
                    data-hud-waypoint={waypointRef(chapter.number, index + 1)}
                    data-at={beats.milestones[index]}
                  />
                </li>
              ));
            })}
          </ul>

          <ol>
            <li style={{ "--at": OPENING_RANGE[0] } as CSSProperties}>
              <a
                href="#takeoff"
                data-hud-segment={0}
                data-count={TAKEOFF_READOUT.count}
                data-title={TAKEOFF_READOUT.title}
                data-destination={firstDestination}
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
                  data-count={`${pad2(chapter.number)} / ${pad2(total)}`}
                  data-title={chapter.title}
                  data-destination={chapter.destination}
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
              {current ? `${pad2(current.number)} / ${pad2(total)}` : TAKEOFF_READOUT.count}
            </dt>
            <dd data-hud="chapter-title">{current ? current.title : TAKEOFF_READOUT.title}</dd>
          </div>
          <div className="hud-field" data-priority="2">
            <dt>Dest</dt>
            <dd data-hud="destination">{current ? current.destination : firstDestination}</dd>
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
