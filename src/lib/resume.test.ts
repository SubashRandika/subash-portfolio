import { describe, expect, it } from "vitest";
import { countPdfPages, describeResume, formatFileSize } from "./resume";

describe("résumé facts", () => {
  it("counts page objects, not the page tree", () => {
    const pdf = Buffer.from("<< /Type /Pages /Count 2 >> << /Type /Page >> << /Type/Page/Parent 1 0 R >>", "latin1");
    expect(countPdfPages(pdf)).toBe(2);
    expect(countPdfPages(Buffer.from("not a pdf"))).toBeNull();
  });

  it("formats sizes in kilobytes, or megabytes when large", () => {
    expect(formatFileSize(101_255)).toBe("99 KB");
    expect(formatFileSize(200)).toBe("1 KB");
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("reads the published résumé", () => {
    const resume = describeResume("/resume.pdf");
    expect(resume).toMatchObject({ href: "/resume.pdf", external: false });
    expect(resume?.pages).toBeGreaterThan(0);
    expect(resume?.size).toMatch(/^\d+(\.\d)? (KB|MB)$/);
  });

  it("offers a hosted résumé without facts, and nothing when there is none", () => {
    expect(describeResume("https://example.com/cv.pdf")).toEqual({
      href: "https://example.com/cv.pdf",
      external: true,
      pages: null,
      size: null,
    });
    expect(describeResume(null)).toBeNull();
    expect(describeResume("/missing.pdf")).toEqual({ href: "/missing.pdf", external: false, pages: null, size: null });
  });
});
