/**
 * Light and dark mode for the portfolio sections.
 *
 * The mode lives in one place: `data-mode` on <html>, set before the first
 * paint by COLOR_MODE_SCRIPT so a dark-mode visitor never sees a white flash.
 * A visitor's own choice is remembered in localStorage; without one the page
 * follows the system setting, including when it changes while the page is
 * open.
 */

export type ColorMode = "light" | "dark";

export const COLOR_MODE_KEY = "color-mode";

/** Runs in <head> before the page paints. */
export const COLOR_MODE_SCRIPT = `(function(){var d=document.documentElement,s=null;try{s=localStorage.getItem("${COLOR_MODE_KEY}")}catch(e){}var m=s==="dark"||s==="light"?s:(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");d.dataset.mode=m})();`;

function storedMode(): ColorMode | null {
  try {
    const value = window.localStorage.getItem(COLOR_MODE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function systemMode(): ColorMode {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** The mode the page is showing now. */
export function currentMode(): ColorMode {
  return document.documentElement.dataset.mode === "dark" ? "dark" : "light";
}

/** Shows `mode` and remembers it as the visitor's choice. */
export function chooseMode(mode: ColorMode): void {
  document.documentElement.dataset.mode = mode;
  try {
    window.localStorage.setItem(COLOR_MODE_KEY, mode);
  } catch {
    // Private windows may refuse storage; the choice still applies now.
  }
}

/**
 * Calls `onChange` whenever the mode changes, from this page or another tab,
 * or from the system setting while the visitor has made no choice.
 */
export function subscribeMode(onChange: () => void): () => void {
  const root = document.documentElement;
  // Make sure the attribute exists even if the head script did not run.
  if (!root.dataset.mode) root.dataset.mode = storedMode() ?? systemMode();

  const observer = new MutationObserver(onChange);
  observer.observe(root, { attributes: true, attributeFilter: ["data-mode"] });

  const system = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const onSystem = () => {
    if (!storedMode()) root.dataset.mode = systemMode();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === COLOR_MODE_KEY) root.dataset.mode = storedMode() ?? systemMode();
  };
  system?.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);

  return () => {
    observer.disconnect();
    system?.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}
