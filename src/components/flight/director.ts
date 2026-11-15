/**
 * The flight director: the master scroll timeline.
 *
 * One GSAP timeline, scrubbed by ScrollTrigger over the flight section, is
 * the single clock for everything scroll-driven in the DOM:
 *
 *   - flight progress handed to the 3D scene,
 *   - the opening and chapter text fading in and out,
 *   - milestones becoming current one by one,
 *   - the HUD rail, readouts and waypoint ticks.
 *
 * The timeline's duration is 1, so a position on it is flight progress.
 * Every tween is a `fromTo` with explicit values, which is what makes the
 * choreography identical when scrubbed backward.
 *
 * This module is only loaded in live mode.
 */

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setFlightTarget } from "@/flight/store";
import { type ChapterNumber, type TimelineSegment, clamp01, segmentAt } from "@/flight/timeline";
import { OPENING_EXIT, chapterBeats, milestoneArrival, segmentArrival } from "@/flight/waypoints";

export interface FlightDirector {
  /** Moves the flight to a progress value, gliding if it is close and cutting if it is far. */
  flyTo(progress: number): void;
  /** Stops everything and restores the markup to its untouched state. */
  destroy(): void;
}

/** Jumps longer than this cut through a veil instead of gliding. */
const GLIDE_LIMIT = 0.13;

/** Seconds of gliding per unit of progress, and its bounds. */
const GLIDE_RATE = 56;
const GLIDE_MIN = 0.9;
const GLIDE_MAX = 6;

const VEIL_MS = 260;

function isChapterNumber(value: number): value is ChapterNumber {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function formatPercent(progress: number): string {
  return String(Math.round(clamp01(progress) * 100)).padStart(3, "0");
}

export function createFlightDirector(section: HTMLElement): FlightDirector {
  gsap.registerPlugin(ScrollTrigger);

  const touched: Element[] = [];
  const track = <T extends Element>(elements: T[]): T[] => {
    touched.push(...elements);
    return elements;
  };
  const all = <T extends Element = HTMLElement>(selector: string) =>
    track(Array.from(section.querySelectorAll<T>(selector)));

  // ------------------------------------------------------------------------
  // Timeline
  // ------------------------------------------------------------------------

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const playhead = { progress: 0 };

  const timeline = gsap.timeline({
    defaults: { ease: "none", immediateRender: false },
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      // Touch scrolling already has momentum; keep the lag short there.
      scrub: coarsePointer ? 0.35 : 0.7,
      invalidateOnRefresh: true,
    },
  });
  const trigger = timeline.scrollTrigger;

  timeline.fromTo(playhead, { progress: 0 }, { progress: 1, duration: 1 }, 0);

  // Opening text leaves as the takeoff roll begins.
  const opening = all("[data-flight-part='opening']");
  timeline.fromTo(
    opening,
    { autoAlpha: 1, y: 0 },
    { autoAlpha: 0, y: -28, duration: OPENING_EXIT[1] - OPENING_EXIT[0], ease: "power1.in" },
    OPENING_EXIT[0],
  );

  // Chapters.
  for (const chapter of all("[data-chapter]")) {
    const number = Number(chapter.dataset.chapter);
    if (!isChapterNumber(number)) continue;

    const body = track(
      Array.from(chapter.querySelectorAll<HTMLElement>("[data-flight-part='body']")),
    );
    const cards = track(Array.from(chapter.querySelectorAll<HTMLElement>("[data-milestone]")));
    const closing = track(Array.from(chapter.querySelectorAll<HTMLElement>(".flight-closing")));
    const beats = chapterBeats(number, cards.length);

    if (body.length === 0) continue;
    gsap.set(body, { autoAlpha: 0 });
    if (cards.length > 0) gsap.set(cards, { autoAlpha: 0, "--lit": 0 });
    if (closing.length > 0) gsap.set(closing, { autoAlpha: 0 });

    timeline.fromTo(
      body,
      { autoAlpha: 0, y: 26 },
      { autoAlpha: 1, y: 0, duration: beats.introIn[1] - beats.introIn[0], ease: "power2.out" },
      beats.introIn[0],
    );

    cards.forEach((card, index) => {
      const at = beats.milestones[index];
      if (at === undefined) return;
      const next = beats.milestones[index + 1];
      // Appear just before becoming the current milestone…
      timeline.fromTo(
        card,
        { autoAlpha: 0, x: -14 },
        { autoAlpha: 1, x: 0, duration: 0.004 },
        at - 0.004,
      );
      timeline.fromTo(card, { "--lit": 0 }, { "--lit": 1, duration: 0.003 }, at - 0.003);
      // …and hand over to the next one.
      if (next !== undefined) {
        timeline.fromTo(card, { "--lit": 1 }, { "--lit": 0, duration: 0.003 }, next - 0.003);
      }
    });

    timeline.fromTo(
      body,
      { autoAlpha: 1, y: 0 },
      { autoAlpha: 0, y: -22, duration: beats.exit[1] - beats.exit[0], ease: "power1.in" },
      beats.exit[0],
    );

    if (beats.closingIn && closing.length > 0) {
      timeline.fromTo(
        closing,
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: beats.closingIn[1] - beats.closingIn[0],
          ease: "power2.out",
        },
        beats.closingIn[0],
      );
    }
  }

  // ------------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------------

  const rail = section.querySelector<HTMLElement>("[data-hud='rail']");
  const percent = section.querySelector<HTMLElement>("[data-hud='percent']");
  const chapterCount = section.querySelector<HTMLElement>("[data-hud='chapter-count']");
  const chapterTitle = section.querySelector<HTMLElement>("[data-hud='chapter-title']");
  const destination = section.querySelector<HTMLElement>("[data-hud='destination']");
  const segmentLinks = Array.from(
    section.querySelectorAll<HTMLAnchorElement>("[data-hud-segment]"),
  );
  const waypoints = Array.from(
    section.querySelectorAll<HTMLAnchorElement>("[data-hud-waypoint]"),
  ).map((element) => ({ element, at: Number(element.dataset.at), passed: false }));

  const initialHud = {
    percent: percent?.textContent ?? "",
    count: chapterCount?.textContent ?? "",
    title: chapterTitle?.textContent ?? "",
    destination: destination?.textContent ?? "",
  };

  const hud = { progress: -1, percent: "", segment: -1 as TimelineSegment | -1 };

  const showSegment = (segment: TimelineSegment) => {
    for (const link of segmentLinks) {
      const linkSegment = Number(link.dataset.hudSegment);
      if (linkSegment === segment) {
        link.setAttribute("aria-current", "step");
        if (chapterCount) chapterCount.textContent = link.dataset.count ?? "";
        if (chapterTitle) chapterTitle.textContent = link.dataset.title ?? "";
        if (destination) destination.textContent = link.dataset.destination ?? "";
      } else {
        link.removeAttribute("aria-current");
      }
      if (linkSegment < segment) link.dataset.passed = "true";
      else delete link.dataset.passed;
    }
  };

  const updateHud = () => {
    const progress = playhead.progress;
    setFlightTarget(progress);
    if (Math.abs(progress - hud.progress) < 0.0002) return;
    hud.progress = progress;

    rail?.style.setProperty("--progress", progress.toFixed(4));

    const text = formatPercent(progress);
    if (text !== hud.percent && percent) {
      hud.percent = text;
      percent.textContent = text;
    }

    const segment = segmentAt(progress);
    if (segment !== hud.segment) {
      hud.segment = segment;
      showSegment(segment);
    }

    for (const waypoint of waypoints) {
      const passed = progress >= waypoint.at;
      if (passed !== waypoint.passed) {
        waypoint.passed = passed;
        if (passed) waypoint.element.dataset.passed = "true";
        else delete waypoint.element.dataset.passed;
      }
    }
  };
  gsap.ticker.add(updateHud);

  // ------------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------------

  const veil = section.querySelector<HTMLElement>(".flight-veil");
  let glide: gsap.core.Tween | null = null;
  let veilTimer = 0;

  const scrollFor = (progress: number) => {
    const top = section.getBoundingClientRect().top + window.scrollY;
    return top + clamp01(progress) * (section.offsetHeight - window.innerHeight);
  };

  const cancelGlide = () => {
    glide?.kill();
    glide = null;
  };

  const flyTo = (progress: number) => {
    cancelGlide();
    window.clearTimeout(veilTimer);
    const target = clamp01(progress);
    const distance = Math.abs(target - playhead.progress);
    const y = scrollFor(target);

    if (distance <= GLIDE_LIMIT) {
      // Close by: fly there, so "Begin flight" plays the takeoff.
      const proxy = { y: window.scrollY };
      glide = gsap.to(proxy, {
        y,
        duration: gsap.utils.clamp(GLIDE_MIN, GLIDE_MAX, distance * GLIDE_RATE),
        ease: "power2.inOut",
        onUpdate: () => window.scrollTo(0, proxy.y),
        onComplete: () => {
          glide = null;
        },
      });
      return;
    }

    // Far away: cut. Racing through several environments would be a blur
    // and would force all of them to load.
    veil?.setAttribute("data-on", "true");
    veilTimer = window.setTimeout(() => {
      window.scrollTo(0, y);
      ScrollTrigger.update();
      // Finish the scrub immediately instead of letting it catch up.
      const scrubTween = trigger?.getTween();
      if (scrubTween) scrubTween.progress(1);
      else timeline.progress(target);
      updateHud();
      veilTimer = window.setTimeout(() => veil?.removeAttribute("data-on"), 90);
    }, VEIL_MS);
  };

  /** Maps an in-page link to flight progress, or null if it leaves the flight. */
  const progressFor = (id: string): number | null => {
    if (id === "top" || id === "takeoff") return 0;
    const chapterMatch = /^chapter-0([1-6])$/.exec(id);
    if (chapterMatch) return segmentArrival(Number(chapterMatch[1]) as ChapterNumber);

    const element = document.getElementById(id);
    const reference = element?.dataset.milestone; // "5.3"
    if (!element || !reference) return null;
    const chapter = element.closest<HTMLElement>("[data-chapter]");
    const number = Number(chapter?.dataset.chapter);
    if (!chapter || !isChapterNumber(number)) return null;
    const cards = Array.from(chapter.querySelectorAll("[data-milestone]"));
    const index = cards.indexOf(element);
    return index < 0 ? null : milestoneArrival(number, index, cards.length);
  };

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    const id = link?.getAttribute("href")?.slice(1);
    if (!id) return;
    const progress = progressFor(id);
    if (progress === null) return;
    event.preventDefault();
    flyTo(progress);
    history.replaceState(null, "", id === "top" ? window.location.pathname : `#${id}`);
  };

  // Any deliberate scroll input takes control back from a glide.
  const onUserScroll = () => cancelGlide();
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      ["Escape", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(
        event.key,
      )
    ) {
      cancelGlide();
    }
  };

  document.addEventListener("click", onClick);
  window.addEventListener("wheel", onUserScroll, { passive: true });
  window.addEventListener("touchstart", onUserScroll, { passive: true });
  window.addEventListener("keydown", onKeyDown);

  updateHud();

  return {
    flyTo,
    destroy() {
      cancelGlide();
      window.clearTimeout(veilTimer);
      veil?.removeAttribute("data-on");
      document.removeEventListener("click", onClick);
      window.removeEventListener("wheel", onUserScroll);
      window.removeEventListener("touchstart", onUserScroll);
      window.removeEventListener("keydown", onKeyDown);
      gsap.ticker.remove(updateHud);
      trigger?.kill();
      timeline.kill();

      // Put the markup back exactly as the server rendered it, so the static
      // experience is intact if the page falls back to it.
      gsap.set(touched, { clearProps: "all" });
      rail?.style.removeProperty("--progress");
      if (percent) percent.textContent = initialHud.percent;
      if (chapterCount) chapterCount.textContent = initialHud.count;
      if (chapterTitle) chapterTitle.textContent = initialHud.title;
      if (destination) destination.textContent = initialHud.destination;
      for (const link of segmentLinks) {
        delete link.dataset.passed;
        if (Number(link.dataset.hudSegment) === 0) link.setAttribute("aria-current", "step");
        else link.removeAttribute("aria-current");
      }
      for (const waypoint of waypoints) delete waypoint.element.dataset.passed;
    },
  };
}
