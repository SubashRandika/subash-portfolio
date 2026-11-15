import { describe, expect, it } from "vitest";
import {
  canBeContacted,
  resolveContact,
  validEmail,
  validGitHub,
  validLinkedIn,
  validResume,
} from "./contact";

const none = { email: null, linkedin: null, github: null, resume: null };

describe("contact validation", () => {
  it("accepts plain email addresses only", () => {
    expect(validEmail(" name@example.com ")).toBe("name@example.com");
    expect(validEmail("not an email")).toBeNull();
    expect(validEmail("name@localhost")).toBeNull();
    expect(validEmail("<a@b.co>")).toBeNull();
  });

  it("accepts https profile URLs on the right host", () => {
    expect(validLinkedIn("https://www.linkedin.com/in/someone")).toBe("https://www.linkedin.com/in/someone");
    expect(validLinkedIn("http://www.linkedin.com/in/someone")).toBeNull();
    expect(validLinkedIn("https://linkedin.com.evil.example/in/x")).toBeNull();
    expect(validLinkedIn("https://www.linkedin.com/")).toBeNull();
    expect(validGitHub("https://github.com/someone")).toBe("https://github.com/someone");
    expect(validGitHub("https://gitlab.com/someone")).toBeNull();
  });

  it("accepts a PDF in public/ or on https", () => {
    expect(validResume("/resume.pdf")).toBe("/resume.pdf");
    expect(validResume("/files/Subash-Rodrigo.pdf")).toBe("/files/Subash-Rodrigo.pdf");
    expect(validResume("https://example.com/cv.pdf")).toBe("https://example.com/cv.pdf");
    expect(validResume("/../secrets.pdf")).toBeNull();
    expect(validResume("/resume.docx")).toBeNull();
    expect(validResume("javascript:alert(1)")).toBeNull();
  });
});

describe("resolveContact", () => {
  it("publishes nothing when nothing is supplied", () => {
    const { links, problems } = resolveContact(none, {});
    expect(links).toEqual(none);
    expect(problems).toEqual([]);
    expect(canBeContacted(links)).toBe(false);
  });

  it("prefers deployment settings over the data file", () => {
    const { links } = resolveContact(
      { ...none, github: "https://github.com/from-data" },
      { NEXT_PUBLIC_GITHUB_URL: "https://github.com/from-env" },
    );
    expect(links.github).toBe("https://github.com/from-env");
    expect(canBeContacted(links)).toBe(true);
  });

  it("drops and reports invalid values instead of rendering them", () => {
    const { links, problems } = resolveContact(none, {
      NEXT_PUBLIC_CONTACT_EMAIL: "nope",
      NEXT_PUBLIC_RESUME_URL: "/resume.pdf",
    });
    expect(links.email).toBeNull();
    expect(links.resume).toBe("/resume.pdf");
    expect(problems).toHaveLength(1);
    // A résumé alone is not a way to get in touch.
    expect(canBeContacted(links)).toBe(false);
  });
});
