import type { Metadata } from "next";
import { Suspense } from "react";
import { AircraftLabLoader } from "@/components/lab/AircraftLabLoader";

export const metadata: Metadata = {
  title: "Aircraft lab — Career Journey",
  robots: { index: false, follow: false },
};

/**
 * Internal inspection page for the aircraft model. Not linked or indexed.
 * Views: ?view=front34|rear34|side|top|front|low|detail|nose, gear: ?gear=0..1
 */
export default function AircraftLabPage() {
  return (
    <main id="main" className="flex-1">
      <h1 className="sr-only">Aircraft model inspection</h1>
      <Suspense fallback={null}>
        <AircraftLabLoader />
      </Suspense>
    </main>
  );
}
