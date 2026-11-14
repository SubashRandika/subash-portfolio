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
      ["First Takeoff", "Pearson / WSO2"],
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

  it("keeps the employment dates given in the brief", () => {
    expect(experience.map((e) => [e.role, e.start, e.end])).toEqual([
      ["Technical Lead", "2022-03-15", null],
      ["Associate Technical Lead", "2022-01-01", "2022-03-14"],
      ["Senior Software Engineer", "2021-10-04", "2021-12-31"],
      ["Associate Technical Lead", "2017-04-17", "2021-09-30"],
      ["Software Engineer", "2013-06-17", "2017-04-14"],
    ]);
  });

  it("never lists a client or product as an employer", () => {
    const clients = ["Qmatic", "Senseforce", "Geposit", "IFS", "Finago", "Biosero"];
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
      null,
    ]);
  });

  it("shows Pearson / WSO2 exactly as stated while their relationship is unconfirmed", () => {
    const first = experience[experience.length - 1];
    expect(first?.employer).toBeNull();
    expect(first?.organisationAsStated).toBe("Pearson / WSO2");
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
  it("withholds the unverified Finago UX figure", () => {
    expect(allText()).not.toMatch(/50\s?%/);
  });

  it("leaves unsupplied personal facts empty instead of inventing them", () => {
    // These become real values only when Subash provides them.
    expect(profile.links).toEqual({ linkedin: null, github: null, email: null, resume: null });
    expect(profile.education).toEqual([]);
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
