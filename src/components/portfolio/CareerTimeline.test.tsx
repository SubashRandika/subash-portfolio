import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CareerTimeline } from "./CareerTimeline";
import { experience } from "@/data/experience";

describe("CareerTimeline entrance", () => {
  it("is simply drawn where the entrance cannot run", () => {
    // jsdom has neither IntersectionObserver nor matchMedia.
    render(<CareerTimeline entries={experience} />);
    const figure = screen.getByRole("figure", { name: "Career timeline" });
    expect(figure).toHaveAttribute("data-reveal", "shown");
    expect(figure.querySelectorAll(".timeline-bar")).toHaveLength(experience.length);
  });

  it("starts the playhead at the first role's year and hides it from assistive technology", () => {
    render(<CareerTimeline entries={experience} />);
    const sweep = document.querySelector(".timeline-sweep");
    expect(sweep).toHaveAttribute("aria-hidden", "true");
    const first = Math.min(...experience.map((entry) => new Date(entry.start).getUTCFullYear()));
    expect(sweep).toHaveTextContent(String(first));
  });
});
