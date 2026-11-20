import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { recommendations } from "@/data/recommendations";
import { Recommendations, initialsOf, offsetFrom } from "./Recommendations";

const SOURCE = "https://www.linkedin.com/in/subash-rodrigo/details/recommendations/";

describe("Recommendations", () => {
  it("shows every recommendation as a slide with its quote and recommender", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const carousel = screen.getByRole("region", { name: "Recommendations from LinkedIn" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    // Only the centre slide is exposed to assistive technology; the rest are
    // hidden until they come to the centre, so all are found by class here.
    const slides = [...carousel.querySelectorAll<HTMLElement>(".rec-slide")];
    expect(slides).toHaveLength(recommendations.length);

    recommendations.forEach((item, index) => {
      const slide = slides[index]!;
      expect(slide).toHaveAttribute("aria-label", `${index + 1} of ${recommendations.length}: ${item.name}`);
      expect(slide).toHaveTextContent(item.excerpt);
      expect(slide).toHaveTextContent(item.name);
      expect(slide).toHaveTextContent(item.headline);
      expect(slide).toHaveTextContent(item.relationship);
      // The full text is there, behind "Read the full recommendation".
      for (const paragraph of item.text) expect(slide).toHaveTextContent(paragraph);
    });
  });

  it("marks the first recommendation as current and moves with the controls", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const dots = screen.getAllByRole("button", { name: /^Recommendation \d+:/ });
    expect(dots).toHaveLength(recommendations.length);
    expect(dots[0]).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next recommendation" }));
    expect(dots[1]).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "Previous recommendation" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous recommendation" }));
    // Wraps round to the last one.
    expect(dots[recommendations.length - 1]).toHaveAttribute("aria-current", "true");
    fireEvent.click(dots[3]!);
    expect(dots[3]).toHaveAttribute("aria-current", "true");
  });

  it("keeps the centre card in focus and its neighbours either side", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const centre = screen.getByRole("group", { name: /^1 of \d+: / });
    expect(centre).toHaveAttribute("data-active", "true");
    expect(centre.querySelector("figure")).not.toHaveAttribute("inert");
    const slides = [...document.querySelectorAll<HTMLElement>(".rec-slide")];
    const left = slides[slides.length - 1]!;
    const right = slides[1]!;
    expect(left).toHaveAttribute("data-offset", "-1");
    expect(right).toHaveAttribute("data-offset", "1");
    // Side cards cannot be tabbed into; clicking one brings it to the centre.
    expect(right.querySelector("figure")).toHaveAttribute("inert");
    fireEvent.click(right);
    expect(right).toHaveAttribute("data-active", "true");
    expect(screen.getAllByRole("button", { name: /^Recommendation \d+:/ })[1]).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("can pause and restart the automatic rotation", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const pause = screen.getByRole("button", { name: "Pause automatic rotation" });
    fireEvent.click(pause);
    expect(screen.getByRole("button", { name: "Start automatic rotation" })).toBeInTheDocument();
    expect(document.querySelector(".rec-dot-fill")).toBeNull();
  });

  it("links to every recommendation on LinkedIn", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const link = screen.getByRole("link", { name: "All recommendations on LinkedIn (opens in a new tab)" });
    expect(link).toHaveAttribute("href", SOURCE);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders nothing without recommendations", () => {
    const { container } = render(<Recommendations items={[]} source={SOURCE} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("recommendation data", () => {
  it("takes each excerpt word for word from its recommendation", () => {
    for (const item of recommendations) {
      expect(item.text.join("\n")).toContain(item.excerpt);
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("places cards round the centre so the row loops", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => offsetFrom(index, 0, 9))).toEqual([
      0, 1, 2, 3, 4, -4, -3, -2, -1,
    ]);
    expect(offsetFrom(0, 8, 9)).toBe(1);
    expect(offsetFrom(7, 8, 9)).toBe(-1);
    expect(offsetFrom(1, 0, 2)).toBe(-1);
  });

  it("makes initials from names", () => {
    expect(initialsOf("Clyde Casiechitty")).toBe("CC");
    expect(initialsOf("Sampath  Liyanage")).toBe("SL");
  });
});
