import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { recommendations } from "@/data/recommendations";
import { Recommendations, initialsOf } from "./Recommendations";

const SOURCE = "https://www.linkedin.com/in/subash-rodrigo/details/recommendations/";

describe("Recommendations", () => {
  it("shows every recommendation as a slide with its quote and recommender", () => {
    render(<Recommendations items={recommendations} source={SOURCE} />);
    const carousel = screen.getByRole("region", { name: "Recommendations from LinkedIn" });
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    // (Each full text is a <details>, also a group; slides are named "n of 8: …".)
    const slides = within(carousel).getAllByRole("group", { name: / of \d+: / });
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

  it("makes initials from names", () => {
    expect(initialsOf("Clyde Casiechitty")).toBe("CC");
    expect(initialsOf("Sampath  Liyanage")).toBe("SL");
  });
});
