import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Contact, contactLinks } from "@/components/portfolio/Contact";
import { Education } from "@/components/portfolio/Education";
import { CareerTimeline, layoutTimeline } from "@/components/portfolio/CareerTimeline";
import { Experience } from "@/components/portfolio/Experience";
import { ChapterSection } from "@/components/storytelling/ChapterSection";
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
    const item = screen.getByRole("listitem");
    expect(item.querySelectorAll("p")).toHaveLength(0);
    // Nothing to open, so no button.
    expect(within(item).queryByRole("button")).toBeNull();
  });

  it("has a disclosure button that controls the detail", () => {
    render(
      <ol>
        <MilestoneCard
          chapter={6}
          position={3}
          milestone={{ id: "lead", title: "Leading", points: ["Mentoring engineers"] }}
        />
      </ol>,
    );
    const button = screen.getByRole("button", { name: "Details: Leading" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const detail = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(detail).not.toBeNull();
    expect(detail).toHaveTextContent("Mentoring engineers");
    expect(button.closest("li.milestone")).toHaveAttribute("id", "milestone-6-lead");
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

  it("marks the current role as Present and shows the 2015 change as a year", () => {
    render(<Experience entries={experience} />);
    const table = screen.getByRole("table", { name: /Work experience/ });
    expect(within(table).getByText("Present")).toBeInTheDocument();
    const virtusa = within(table).getByText("Virtusa").closest("tr") as HTMLElement;
    expect(virtusa).toHaveTextContent("17 Jun 2013");
    expect(virtusa).toHaveTextContent("WSO2");
    const jkcs = within(table).getByText("JKCS").closest("tr") as HTMLElement;
    expect(jkcs).toHaveTextContent("14 Apr 2017");
    expect(jkcs).toHaveTextContent("Pearson");
    expect(within(virtusa).getByText("2015")).toBeInTheDocument();
    expect(within(jkcs).getByText("2015")).toBeInTheDocument();
  });
});

describe("CareerTimeline", () => {
  it("lays the career out oldest first on one axis", () => {
    const { rows, years } = layoutTimeline(experience);
    expect(rows.map((r) => r.entry.id)).toEqual([
      "virtusa-2013",
      "jkcs-2015",
      "creative-software-2017",
      "paze-industries-2021",
      "ascentic-2022",
      "creative-software-2022",
    ]);
    rows.forEach((row, index) => {
      expect(row.width).toBeGreaterThan(0);
      expect(row.left + row.width).toBeLessThanOrEqual(1 + 1e-9);
      const next = rows[index + 1];
      if (next) expect(next.left).toBeGreaterThanOrEqual(row.left + row.width - 0.002);
    });
    // Only the current role is open-ended, and it runs to the end of the track.
    expect(rows.filter((r) => r.open).map((r) => r.entry.id)).toEqual(["creative-software-2022"]);
    expect(rows.at(-1)!.left + rows.at(-1)!.width).toBeCloseTo(1, 9);
    expect(years[0]!.year).toBe(2014);
    expect(years.at(-1)!.year).toBe(2022);
  });

  it("reads as text and links each role to its flight chapters", () => {
    render(<CareerTimeline entries={experience} />);
    const figure = screen.getByRole("figure", { name: "Career timeline" });
    const items = within(figure).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent("Virtusa · WSO2");
    expect(items[0]).toHaveTextContent("17 Jun 2013");
    expect(items[1]).toHaveTextContent("JKCS · Pearson");
    expect(items[5]).toHaveTextContent("Present");
    const hrefs = within(figure)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "#chapter-01",
      "#chapter-01",
      "#chapter-02",
      "#chapter-03",
      "#chapter-04",
      "#chapter-05",
      "#chapter-06",
    ]);
  });
});

describe("ChapterSection", () => {
  it("lists the chapter's focus areas", () => {
    const chapter = chapters[4]!;
    render(<ChapterSection chapter={chapter} totalChapters={6} />);
    const focus = screen.getByRole("heading", { name: "Focus" }).nextElementSibling as HTMLElement;
    expect(within(focus).getAllByRole("listitem").map((li) => li.textContent)).toEqual(chapter.focus);
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
    const none = { email: null, linkedin: null, github: null, resume: null };
    render(<Contact profile={profile} links={none} />);
    expect(screen.getByRole("heading", { name: "The journey continues." })).toBeInTheDocument();
    expect(screen.getByText("The next mission could be ours.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("links to every supplied way to get in touch", () => {
    render(<Contact profile={profile} links={profile.links} />);
    expect(screen.getByRole("link", { name: /Email/ })).toHaveAttribute(
      "href",
      "mailto:subash.rodrigo@gmail.com",
    );
    expect(screen.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/in/subash-rodrigo/",
    );
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/SubashRandika",
    );
  });
});

describe("Education", () => {
  it("renders nothing until real entries exist", () => {
    const { container } = render(<Education entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the degree, university and year", () => {
    render(<Education entries={profile.education} />);
    expect(
      screen.getByRole("heading", { name: "Bachelor of Science in Computer Science (Special)" }),
    ).toBeInTheDocument();
    expect(screen.getByText("University of Kelaniya, Sri Lanka")).toBeInTheDocument();
    expect(screen.getByText("Graduated 2013")).toBeInTheDocument();
  });
});
