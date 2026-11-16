import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { About } from "./About";
import { profile } from "@/data/profile";
import { experience } from "@/data/experience";

// The bundler turns an image import into its URL and size; stand in for it.
vi.mock("@/assets/subash-rodrigo-portrait.jpg", () => ({
  default: { src: "/portrait.jpg", width: 960, height: 1200, blurDataURL: "data:image/jpeg;base64,AA==" },
}));

describe("About portrait", () => {
  it("shows the portrait with a descriptive name and a caption", () => {
    render(<About profile={profile} current={experience.find((entry) => entry.end === null)} />);
    const image = screen.getByRole("img", { name: "Subash Rodrigo, Lead Software Engineer" });
    expect(image).toBeInTheDocument();
    const figure = image.closest("figure");
    expect(figure).not.toBeNull();
    expect(figure).toHaveTextContent("Fig. 01");
    expect(figure).toHaveTextContent("Lead Software Engineer, since 2013");
  });

  it("is simply shown where the entrance cannot run", () => {
    // jsdom has neither IntersectionObserver nor matchMedia.
    render(<About profile={profile} current={undefined} />);
    expect(document.querySelector(".portrait")).toHaveAttribute("data-reveal", "shown");
  });
});
