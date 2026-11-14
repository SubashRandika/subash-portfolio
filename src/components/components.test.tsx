import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Contact, contactLinks } from "@/components/portfolio/Contact";
import { Education } from "@/components/portfolio/Education";
import { Experience } from "@/components/portfolio/Experience";
import { FlightHUD, formatProgress } from "@/components/storytelling/FlightHUD";
import { MilestoneCard } from "@/components/storytelling/MilestoneCard";
import { Button, ButtonLink } from "@/components/ui/Button";
import { chapters } from "@/data/chapters";
import { experience } from "@/data/experience";
import { profile } from "@/data/profile";

describe("Button", () => {
  it("defaults to type=button so it never submits a form by accident", () => {
    render(<Button>Begin flight</Button>);
    expect(screen.getByRole("button", { name: "Begin flight" })).toHaveAttribute("type", "button");
  });

  it("renders external links safely and announces the new tab", () => {
    render(
      <ButtonLink href="https://example.com" external>
        Profile
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: /Profile.*opens in a new tab/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("MilestoneCard", () => {
  it("shows the title, group and waypoint reference", () => {
    render(
      <ol>
        <MilestoneCard
          chapter={5}
          position={2}
          milestone={{ id: "x", title: "Design system", group: "IFS", summary: "A summary." }}
        />
      </ol>,
    );
    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("heading", { name: "Design system" })).toBeInTheDocument();
    expect(within(item).getByText("IFS")).toBeInTheDocument();
    expect(within(item).getByText("A summary.")).toBeInTheDocument();
    expect(item).toHaveAttribute("data-milestone", "5.2");
  });

  it("omits the summary when the brief gives nothing beyond the title", () => {
    render(
      <ol>
        <MilestoneCard chapter={3} position={1} milestone={{ id: "y", title: "Widgets" }} />
      </ol>,
    );
    expect(screen.getByRole("listitem").querySelectorAll("p")).toHaveLength(0);
  });
});

describe("FlightHUD", () => {
  it("formats progress as a fixed-width percentage", () => {
    expect(formatProgress(0)).toBe("000");
    expect(formatProgress(0.344)).toBe("034");
    expect(formatProgress(1)).toBe("100");
    expect(formatProgress(7)).toBe("100");
  });

  it("links to takeoff and all six chapters and marks the current one", () => {
    render(<FlightHUD chapters={chapters} profile={profile} segment={2} progress={0.3} />);
    const nav = screen.getByRole("navigation", { name: "Flight chapters" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#takeoff",
      "#chapter-01",
      "#chapter-02",
      "#chapter-03",
      "#chapter-04",
      "#chapter-05",
      "#chapter-06",
    ]);
    const current = links.filter((l) => l.getAttribute("aria-current") === "step");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Chapter 2: Building Momentum/);
    expect(screen.getByText("Qmatic AB")).toBeInTheDocument();
  });
});

describe("Experience", () => {
  it("keeps employer and client in separate columns", () => {
    render(<Experience entries={experience} />);
    const table = screen.getByRole("table", { name: /Work experience/ });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["Period", "Role", "Employer", "Client / product", "Work"]);

    const qmaticRow = within(table).getByText("Qmatic AB").closest("tr");
    expect(qmaticRow).not.toBeNull();
    const cells = within(qmaticRow as HTMLElement).getAllByRole("cell");
    // cells: period, employer, client, work (role is the row header)
    expect(cells[1]).toHaveTextContent("Creative Software");
    expect(cells[2]).toHaveTextContent("Qmatic AB");
    expect(cells[1]).not.toHaveTextContent("Qmatic");
  });

  it("marks the current role as Present and shows Pearson / WSO2 as stated", () => {
    render(<Experience entries={experience} />);
    expect(screen.getByText("Present")).toBeInTheDocument();
    expect(screen.getByText("Pearson / WSO2")).toBeInTheDocument();
  });
});

describe("Contact", () => {
  it("builds links only for the facts that exist", () => {
    expect(contactLinks({ linkedin: null, github: null, email: null, resume: null })).toEqual([]);
    const links = contactLinks({
      linkedin: "https://www.linkedin.com/in/example/",
      github: null,
      email: "person@example.com",
      resume: "/resume/example.pdf",
    });
    expect(links.map((l) => [l.id, l.href, l.value])).toEqual([
      ["email", "mailto:person@example.com", "person@example.com"],
      ["linkedin", "https://www.linkedin.com/in/example/", "linkedin.com/in/example"],
      ["resume", "/resume/example.pdf", "Download PDF"],
    ]);
  });

  it("shows the closing message and no placeholder links when none are supplied", () => {
    render(<Contact profile={profile} />);
    expect(screen.getByRole("heading", { name: "The journey continues." })).toBeInTheDocument();
    expect(screen.getByText("The next mission could be ours.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(profile.links.email ? 1 : 0);
  });
});

describe("Education", () => {
  it("renders nothing until real entries exist", () => {
    const { container } = render(<Education entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
