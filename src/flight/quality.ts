/**
 * Graphics quality: three profiles, chosen from what the device is and
 * adjusted by how it actually renders.
 *
 * A device starts on the profile its signals suggest (no GPU, a phone, low
 * memory). While the flight runs, a governor watches frame times; if the
 * device cannot hold its profile it steps down a level, and never back up,
 * so quality does not oscillate. Everything here is framework-free; the
 * scene reads the current settings each frame and React only hears about
 * the rare change of profile.
 */

export type QualityTier = "high" | "medium" | "low";

export const QUALITY_TIERS: readonly QualityTier[] = ["high", "medium", "low"];

export interface QualitySettings {
  tier: QualityTier;
  /** Highest device pixel ratio the canvas renders at. */
  maxPixelRatio: number;
  /** Sun shadows on terrain and buildings. */
  shadows: boolean;
  /** Terrain tiles split while the camera is closer than this many tile widths. */
  terrainDetail: number;
  /** Milliseconds per frame spent building terrain tiles. */
  tileBudgetMs: number;
  /** Soft glows around the aircraft's lights. */
  glows: boolean;
  /** Rooftop plant and other small parts of buildings. */
  buildingDetail: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: {
    tier: "high",
    maxPixelRatio: 1.75,
    shadows: true,
    terrainDetail: 2.1,
    tileBudgetMs: 4,
    glows: true,
    buildingDetail: true,
  },
  medium: {
    tier: "medium",
    maxPixelRatio: 1.25,
    shadows: false,
    terrainDetail: 1.7,
    tileBudgetMs: 3,
    glows: true,
    buildingDetail: true,
  },
  low: {
    tier: "low",
    maxPixelRatio: 1,
    shadows: false,
    terrainDetail: 1.35,
    tileBudgetMs: 2,
    glows: false,
    buildingDetail: false,
  },
};

/** Pixel ratio for a software rasteriser: every pixel is shaded on the CPU. */
export const SOFTWARE_PIXEL_RATIO = 0.5;

/** What is known about the device before the first frame. */
export interface DeviceSignals {
  /** WebGL runs on a software rasteriser (no usable GPU). */
  software: boolean;
  /** The primary pointer is coarse (a finger). */
  coarsePointer: boolean;
  /** Shorter side of the screen, in CSS pixels. */
  shortSide: number;
  /** navigator.deviceMemory, in GB, where the browser reports it. */
  deviceMemory?: number;
  /** navigator.hardwareConcurrency, where reported. */
  cores?: number;
  /** The visitor has asked to save data. */
  saveData?: boolean;
}

/** The profile a device starts on. */
export function initialTier(signals: DeviceSignals): QualityTier {
  const memory = signals.deviceMemory ?? 8;
  const cores = signals.cores ?? 8;
  if (signals.software || signals.saveData || memory <= 2 || cores <= 2) return "low";
  if (signals.coarsePointer || signals.shortSide < 600 || memory <= 4 || cores <= 4) {
    return "medium";
  }
  return "high";
}

/** Reads a `?quality=` override, for testing and profiling. */
export function tierOverride(search: string): QualityTier | null {
  const value = new URLSearchParams(search).get("quality");
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

export const GOVERNOR = {
  /** Frames ignored at the start and after each change, while things settle. */
  warmUp: 120,
  /** Frames averaged per verdict. */
  window: 90,
  /** Average frame time, in milliseconds, above which the profile steps down (under 40 fps). */
  slowAbove: 25,
  /** A frame this long is a pause (a hidden tab, a jump), not a measurement. */
  ignoreAbove: 120,
} as const;

export interface Governor {
  tier: QualityTier;
  /** Frames left before measuring starts again. */
  settling: number;
  samples: number;
  total: number;
}

export function createGovernor(tier: QualityTier): Governor {
  return { tier, settling: GOVERNOR.warmUp, samples: 0, total: 0 };
}

/** The next profile down, or null at the bottom. */
export function lowerTier(tier: QualityTier): QualityTier | null {
  const index = QUALITY_TIERS.indexOf(tier);
  return QUALITY_TIERS[index + 1] ?? null;
}

/**
 * Records one frame. Returns the new profile at the moment the governor
 * steps down, otherwise null.
 */
export function recordFrame(governor: Governor, deltaMs: number): QualityTier | null {
  if (governor.settling > 0) {
    governor.settling--;
    return null;
  }
  if (deltaMs > GOVERNOR.ignoreAbove) return null;
  governor.samples++;
  governor.total += deltaMs;
  if (governor.samples < GOVERNOR.window) return null;
  const average = governor.total / governor.samples;
  governor.samples = 0;
  governor.total = 0;
  if (average <= GOVERNOR.slowAbove) return null;
  const next = lowerTier(governor.tier);
  if (!next) return null;
  governor.tier = next;
  governor.settling = GOVERNOR.warmUp;
  return next;
}

// ---------------------------------------------------------------------------
// Current settings, shared by the scene
// ---------------------------------------------------------------------------

type Listener = (settings: QualitySettings) => void;

let current: QualitySettings = QUALITY.high;
const listeners = new Set<Listener>();

/** The settings in force. Cheap to call every frame. */
export function getQuality(): QualitySettings {
  return current;
}

export function setQualityTier(tier: QualityTier): void {
  if (current.tier === tier) return;
  current = QUALITY[tier];
  for (const listener of listeners) listener(current);
}

export function subscribeQuality(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Restores the default. Used by tests. */
export function resetQuality(): void {
  current = QUALITY.high;
  listeners.clear();
}
