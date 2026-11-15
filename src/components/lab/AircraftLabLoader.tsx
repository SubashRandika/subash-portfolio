"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const AircraftLab = dynamic(
  () => import("@/components/lab/AircraftLab").then((module) => module.AircraftLab),
  { ssr: false },
);

/** Reads the requested view from the URL and mounts the 3D lab on the client. */
export function AircraftLabLoader() {
  const params = useSearchParams();
  const view = params.get("view") ?? "front34";
  const gearParam = Number(params.get("gear") ?? "1");
  const gear = Number.isFinite(gearParam) ? Math.min(1, Math.max(0, gearParam)) : 1;

  return (
    <div className="fixed inset-0 z-[60]" data-lab-view={view}>
      <AircraftLab view={view} gear={gear} />
    </div>
  );
}
