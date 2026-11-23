"use client";

import { useSyncExternalStore } from "react";
import { type ColorMode, chooseMode, currentMode, subscribeMode } from "@/lib/color-mode";

const isDark = () => currentMode() === "dark";
// The server cannot know the visitor's mode; the switch's look comes from
// `data-mode` in CSS, so it is right before hydration either way.
const unknownOnServer = () => null;

/**
 * Dark mode switch, drawn as a small window on the sky: by day a sun over a
 * passing cloud, by night a crescent moon among stars. Pressing it changes
 * the page with a circle of the new sky spreading out from the switch
 * (instantly with reduced motion or where view transitions are missing).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useSyncExternalStore(subscribeMode, isDark, unknownOnServer);

  const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    const next: ColorMode = currentMode() === "dark" ? "light" : "dark";
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof document.startViewTransition !== "function") {
      chooseMode(next);
      return;
    }

    const box = event.currentTarget.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(() => chooseMode(next));
    transition.ready
      .then(() =>
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
          },
          {
            duration: 750,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            pseudoElement: "::view-transition-new(root)",
          },
        ),
      )
      .catch(() => {});
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark ?? false}
      aria-label="Dark mode"
      className={className ? `sky-switch ${className}` : "sky-switch"}
      onClick={toggle}
    >
      <span className="sky-switch-track" aria-hidden="true">
        <span className="sky-switch-stars" />
        <span className="sky-switch-cloud" />
        <span className="sky-switch-orb" />
      </span>
    </button>
  );
}
