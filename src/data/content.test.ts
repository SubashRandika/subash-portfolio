import { describe, expect, it } from "vitest";
import { CHAPTER_NUMBERS, CHAPTER_RANGES } from "@/flight/timeline";
import { chapters } from "./chapters";
import { experience } from "./experience";
import { profile } from "./profile";
import { projects } from "./projects";
import { skillGroups } from "./skills";

/** Every string in the content layer, for whole-content assertions. */
function allText(): string {
  return JSON.stringify({ chapters, experience, profile, projects, skillGroups });
}

describe("chapters", () => {
  it("has the six chapters in order, on the brief's timeline", () => {
    expect(chapters.map((c) => c.number)).toEqual([...CHAPTER_NUMBERS]);
    for (const chapter of chapters) {
      expect(chapter.range).toEqual(CHAPTER_RANGES[chapter.number]);
      expect(chapter.id).toBe(`chapter-0${chapter.number}`);
    }
  });

  it("uses the chapter titles and organisations from the brief", () => {
    expect(chapters.map((c) => [c.title, c.organisation])).toEqual([
      ["First Takeoff", "Virtusa / WSO2 and JKCS / Pearson"],
      ["Building Momentum", "Creative Software / Qmatic AB"],
      ["A New Horizon", "Paze Industries / Senseforce GmbH"],
      ["Mapping New Possibilities", "Ascentic / Geposit"],
      ["Engineering at Scale", "Creative Software / IFS and Finago"],
      ["Leading the Mission", "Creative Software / Biosero"],
    ]);
  });

  it("gives every chapter milestones with unique ids", () => {
    for (const chapter of chapters) {
      expect(chapter.milestones.length).toBeGreaterThan(0);
      const ids = chapter.milestones.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("experience", () => {
  it("is ordered newest first with exactly one current role", () => {
    const starts = experience.map((e) => e.start);
    expect([...starts].sort().reverse()).toEqual(starts);
    expect(experience.filter((e) => e.end === null)).toHaveLength(1);
  });

  it("keeps the employment dates given in the brief and by Subash", () => {
    expect(experience.map((e) => [e.role, e.start, e.end])).toEqual([
      ["Technical Lead", "2022-03-15", null],
      ["Associate Technical Lead", "2022-01-01", "2022-03-14"],
      ["Senior Software Engineer", "2021-10-04", "2021-12-31"],
      ["Associate Technical Lead", "2017-04-17", "2021-09-30"],
      ["Software Engineer", "2015", "2017-04-14"],
      ["Software Engineer", "2013-06-17", "2015"],
    ]);
  });

  it("never lists a client or product as an employer", () => {
    const clients = ["WSO2", "Pearson", "Qmatic", "Senseforce", "Geposit", "IFS", "Finago", "Biosero"];
    for (const entry of experience) {
      for (const client of clients) {
        expect(entry.employer ?? "").not.toContain(client);
      }
    }
    expect(experience.map((e) => e.employer)).toEqual([
      "Creative Software",
      "Ascentic",
      "Paze Industries",
      "Creative Software",
      "JKCS",
      "Virtusa",
    ]);
  });

  it("keeps WSO2 and Pearson as clients of Virtusa and JKCS", () => {
    const byEmployer = Object.fromEntries(
      experience.map((entry) => [entry.employer, entry.engagements.map((e) => e.client)]),
    );
    expect(byEmployer.Virtusa).toEqual(["WSO2"]);
    expect(byEmployer.JKCS).toEqual(["Pearson"]);
  });

  it("shows the 2015 change of employer as a year, not an invented date", () => {
    const virtusa = experience.find((entry) => entry.employer === "Virtusa");
    const jkcs = experience.find((entry) => entry.employer === "JKCS");
    expect(virtusa?.end).toBe("2015");
    expect(jkcs?.start).toBe("2015");
  });

  it("does not invent dates for individual client engagements", () => {
    for (const entry of experience) {
      for (const engagement of entry.engagements) {
        for (const key of Object.keys(engagement)) {
          expect(["client", "product", "role"]).toContain(key);
        }
      }
    }
  });
});

describe("content integrity", () => {
  it("ties the confirmed Finago UX figure to the customer-creation wizard", () => {
    const mentions = allText().match(/[^.]*50\s?%[^.]*/g) ?? [];
    expect(mentions.length).toBeGreaterThan(0);
    for (const mention of mentions) {
      expect(mention).toMatch(/approximately 50%/);
      expect(mention).toMatch(/customer-creation wizard/);
    }
  });

  it("publishes only the contact details and education Subash supplied", () => {
    expect(profile.links).toEqual({
      linkedin: "https://www.linkedin.com/in/subash-rodrigo/",
      github: "https://github.com/SubashRandika",
      email: "subash.rodrigo@gmail.com",
      resume: "/resume.pdf",
    });
    expect(profile.education).toEqual([
      {
        institution: "University of Kelaniya, Sri Lanka",
        qualification: "Bachelor of Science in Computer Science (Special)",
        period: "Graduated 2013",
      },
    ]);
  });

  it("links every project to a chapter that exists", () => {
    for (const project of projects) {
      expect(CHAPTER_NUMBERS).toContain(project.chapter);
    }
  });

  it("has no empty skill groups or duplicate skills", () => {
    const all = skillGroups.flatMap((g) => g.skills);
    expect(new Set(all).size).toBe(all.length);
    for (const group of skillGroups) expect(group.skills.length).toBeGreaterThan(0);
  });
});
