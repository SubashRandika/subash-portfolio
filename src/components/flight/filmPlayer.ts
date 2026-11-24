/**
 * Drives the filmed flight from scroll progress.
 *
 * Each frame it reads the flight progress the director publishes, shows the
 * clip for that part of the timeline and seeks it to the matching moment.
 * Video never plays on its own, so scrolling backward plays the film
 * backward and stopping holds the frame.
 *
 * Clips are downloaded one at a time, nearest first, as whole files (a blob
 * URL), because seeking a partly downloaded video stalls while the browser
 * fetches ranges. Until a clip has arrived its first frame is shown as a
 * still, so a slow connection still sees the right place on every chapter.
 *
 * Imperative and framework-free like the director: React only renders the
 * empty video elements.
 */

import { flightStore } from "@/flight/store";
import {
  CLIP_INDICES,
  type ClipIndex,
  type FilmFraming,
  type FilmQuality,
  clipSrc,
  clipTime,
  filmFrameAt,
  loadOrder,
  posterSrc,
} from "@/flight/film";

export interface FilmPlayerOptions {
  framing: FilmFraming;
  quality: FilmQuality;
  /** Called once the clip on screen can be scrubbed. */
  onReady?: () => void;
}

export interface FilmPlayer {
  /** Pauses or resumes the per-frame loop (e.g. while scrolled away). */
  setActive(active: boolean): void;
  /** Stops loading and drawing, and releases the downloaded clips. */
  destroy(): void;
}

interface Clip {
  index: ClipIndex;
  layer: HTMLElement;
  video: HTMLVideoElement;
  url: string | null;
  ready: boolean;
  /** Last opacity written, to skip redundant style writes. */
  opacity: number;
}

/** Seeks closer than this to the current time are skipped (seconds). */
const SEEK_EPSILON = 1 / 90;

function waitFor(target: EventTarget, type: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const done = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      target.removeEventListener(type, done);
      reject(signal.reason);
    };
    target.addEventListener(type, done, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function createFilmPlayer(host: HTMLElement, options: FilmPlayerOptions): FilmPlayer {
  const { framing, quality, onReady } = options;
  const controller = new AbortController();
  const { signal } = controller;

  host.dataset.framing = framing;
  host.dataset.quality = quality;

  const clips: Clip[] = [];
  for (const index of CLIP_INDICES) {
    const layer = host.querySelector<HTMLElement>(`[data-film-clip="${index}"]`);
    const video = layer?.querySelector("video");
    if (!layer || !video) continue;
    clips[index] = {
      index,
      layer,
      video,
      url: null,
      ready: false,
      opacity: -1,
    };
  }

  let current: ClipIndex = filmFrameAt(flightStore.target).clip;
  let readyReported = false;

  // --------------------------------------------------------------------------
  // Loading
  // --------------------------------------------------------------------------

  /** Shows a clip's first frame as a still. Cheap, so it runs ahead of loading. */
  const showPoster = (index: ClipIndex) => {
    const clip = clips[index];
    if (clip && !clip.video.poster) clip.video.poster = posterSrc(index, framing);
  };

  const reportReady = () => {
    if (readyReported || !clips[current]?.ready) return;
    readyReported = true;
    onReady?.();
  };

  const load = async (clip: Clip) => {
    const response = await fetch(clipSrc(clip.index, framing, quality), {
      signal,
    });
    if (!response.ok) throw new Error(`clip ${clip.index}: HTTP ${response.status}`);
    const blob = await response.blob();
    if (signal.aborted) return;

    clip.url = URL.createObjectURL(blob);
    const { video } = clip;
    video.src = clip.url;
    video.load();
    await waitFor(video, "loadeddata", signal);

    // Some mobile browsers only paint seeked frames of a video that has
    // played; a muted play-and-pause unlocks that without showing motion.
    try {
      await video.play();
    } catch {
      // Autoplay refused: seeking still works on the browsers that refuse it.
    }
    video.pause();
    // Rest on the first frame (where the clip joins the previous one) until
    // it is needed; the play above may have moved it on.
    video.currentTime = 0;

    clip.ready = true;
    clip.layer.dataset.ready = "true";
    reportReady();
  };

  const loadAll = async () => {
    // Re-reads the order after each clip, so a visitor who jumps ahead gets
    // the clips around where they landed next.
    for (;;) {
      if (signal.aborted) return;
      const pending = loadOrder(current)
        .map((index) => clips[index])
        .find((clip) => clip && !clip.ready && clip.url === null);
      if (!pending) return;
      showPoster(pending.index);
      try {
        await load(pending);
      } catch (error) {
        if (signal.aborted) return;
        // Leave the still in place and move on; the page stays usable.
        console.warn("[film] Could not load a clip:", error);
        pending.url = "failed";
      }
    }
  };

  // --------------------------------------------------------------------------
  // Drawing
  // --------------------------------------------------------------------------

  const setOpacity = (clip: Clip, opacity: number) => {
    if (Math.abs(clip.opacity - opacity) < 0.002) return;
    clip.opacity = opacity;
    clip.layer.style.opacity = opacity.toFixed(3);
    clip.layer.style.visibility = opacity > 0 ? "visible" : "hidden";
  };

  const seek = (clip: Clip, local: number) => {
    if (!clip.ready) return;
    const { video } = clip;
    // A seek in flight is left to finish; the next frame asks again.
    if (video.seeking) return;
    const time = clipTime(local, video.duration);
    if (Math.abs(video.currentTime - time) < SEEK_EPSILON) return;
    video.currentTime = time;
  };

  let raf = 0;
  let active = true;

  const draw = () => {
    raf = 0;
    const frame = filmFrameAt(flightStore.target);

    if (frame.clip !== current) {
      current = frame.clip;
      showPoster(current);
      reportReady();
    }
    if (frame.next !== null) showPoster(frame.next);

    for (const clip of clips) {
      if (!clip) continue;
      if (clip.index === frame.clip) setOpacity(clip, 1);
      else if (clip.index === frame.next) setOpacity(clip, frame.blend);
      else setOpacity(clip, 0);
    }

    const clip = clips[frame.clip];
    if (clip) seek(clip, frame.local);
    // The incoming clip waits on its first frame, which is where the
    // outgoing clip ends.
    const incoming = frame.next === null ? undefined : clips[frame.next];
    if (incoming) seek(incoming, 0);

    if (active) raf = requestAnimationFrame(draw);
  };

  showPoster(current);
  draw();
  void loadAll();

  return {
    setActive(next) {
      if (next === active) return;
      active = next;
      if (active && raf === 0) raf = requestAnimationFrame(draw);
      if (!active && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destroy() {
      controller.abort();
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      active = false;
      delete host.dataset.framing;
      delete host.dataset.quality;
      for (const clip of clips) {
        if (!clip) continue;
        clip.video.removeAttribute("src");
        clip.video.removeAttribute("poster");
        clip.video.load();
        if (clip.url && clip.url !== "failed") URL.revokeObjectURL(clip.url);
        delete clip.layer.dataset.ready;
        clip.layer.style.removeProperty("opacity");
        clip.layer.style.removeProperty("visibility");
      }
    },
  };
}
