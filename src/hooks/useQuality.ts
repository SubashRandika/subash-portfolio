"use client";

import { useSyncExternalStore } from "react";
import { QUALITY, type QualitySettings, getQuality, subscribeQuality } from "@/flight/quality";

const serverQuality = (): QualitySettings => QUALITY.high;

/** The graphics profile in force. Re-renders only when the profile changes. */
export function useQuality(): QualitySettings {
  return useSyncExternalStore(subscribeQuality, getQuality, serverQuality);
}
