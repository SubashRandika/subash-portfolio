import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GITHUB_PROFILE, openSourceProjects } from "@/data/openSource";
import { OpenSource } from "./OpenSource";

// The bundler turns an image import into its URL and size; stand in for each.
vi.mock("@/assets/projects/sinha-giri.webp", () => ({ default: shot("sinha-giri") }));
vi.mock("@/assets/projects/lumora.webp", () => ({ default: shot("lumora") }));
vi.mock("@/assets/projects/dream-haus.webp", () => ({ default: shot("dream-haus") }));
vi.mock("@/assets/projects/motio-code.webp", () => ({ default: shot("motio-code") }));
vi.mock("@/assets/projects/aero-shield.webp", () => ({ default: shot("aero-shield") }));
vi.mock("@/assets/projects/crown-clothing.webp", () => ({ default: shot("crown-clothing") }));

function shot(name: string) {
  return { src: `/${name}.webp`, width: 1200, height: 750, blurDataURL: "data:image/webp;base64,AA==" };
}

describe("OpenSource", () => {
  it("shows every project as a card that opens its live demo in a new tab", () => {
    render(<OpenSource projects={openSourceProjects} profile={GITHUB_PROFILE} />);
    const section = screen.getByRole("region", { name: "Personal projects" });
    const cards = within(section).getAllByRole("article");
    expect(cards).toHaveLength(openSourceProjects.length);

    openSourceProjects.forEach((project, index) => {
      const card = cards[index]!;
      const demo = within(card).getByRole("link", {
        name: `${project.name}, live demo (opens in a new tab)`,
      });
      expect(demo).toHaveAttribute("href", project.demo);
      expect(demo).toHaveAttribute("target", "_blank");
      expect(demo).toHaveAttribute("rel", "noopener noreferrer");

      const source = within(card).getByRole("link", { name: new RegExp(`Source of ${project.name} on GitHub`) });
      expect(source).toHaveAttribute("href", project.source);
      expect(within(card).getByRole("img", { name: project.shot })).toBeInTheDocument();
      expect(within(card).getByRole("list", { name: "Built with" })).toHaveTextContent(project.stack[0]!);
    });
  });

  it("links to the rest of the GitHub profile, and leaves it out when there is none", () => {
    const { unmount } = render(<OpenSource projects={openSourceProjects} profile={GITHUB_PROFILE} />);
    expect(screen.getByRole("link", { name: /More of my work on GitHub/ })).toHaveAttribute("href", GITHUB_PROFILE);
    unmount();
    render(<OpenSource projects={openSourceProjects} profile={null} />);
    expect(screen.queryByRole("link", { name: /More of my work on GitHub/ })).toBeNull();
  });

  it("is simply shown where the entrance cannot run", () => {
    // jsdom has neither IntersectionObserver nor matchMedia.
    render(<OpenSource projects={openSourceProjects} profile={GITHUB_PROFILE} />);
    expect(document.querySelector(".oss-grid")).toHaveAttribute("data-reveal", "shown");
  });
});

describe("open-source data", () => {
  it("links each demo and repository over https, with no two alike", () => {
    const demos = openSourceProjects.map((project) => project.demo);
    expect(new Set(demos).size).toBe(demos.length);
    for (const project of openSourceProjects) {
      expect(project.demo).toMatch(/^https:\/\//);
      expect(project.source).toBe(`${GITHUB_PROFILE}/${project.repo}`);
    }
  });
});
