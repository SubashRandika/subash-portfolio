import { describe, expect, it } from "vitest";
import { profile } from "@/data/profile";
import { SHARING_IMAGE, SITE_TITLE, buildJsonLd, buildMetadata, jsonLdScript } from "./seo";
import { resolveSiteUrl } from "./site";

const live = resolveSiteUrl("https://www.example.com");
const preview = resolveSiteUrl(undefined);

type Node = Record<string, unknown>;
const graph = (data: Record<string, unknown>) => data["@graph"] as Node[];
const byType = (data: Record<string, unknown>, type: string) =>
  graph(data).find((node) => node["@type"] === type) as Node;

describe("metadata", () => {
  it("uses the title and description from the brief", () => {
    const metadata = buildMetadata(live);
    expect(metadata.title).toBe(SITE_TITLE);
    expect(metadata.description).toMatch(/^Subash Rodrigo is a Lead Software Engineer with 13\+ years/);
  });

  it("has a canonical URL and is indexable on the real domain", () => {
    const metadata = buildMetadata(live);
    expect(metadata.metadataBase?.toString()).toBe("https://www.example.com/");
    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("stays out of search results without a domain, and claims no canonical URL", () => {
    const metadata = buildMetadata(preview);
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("shares with a large image card", () => {
    const metadata = buildMetadata(live);
    expect(metadata.openGraph).toMatchObject({ type: "profile", firstName: "Subash", lastName: "Rodrigo" });
    expect(JSON.stringify(metadata.openGraph)).toContain(SHARING_IMAGE.path);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });
});

describe("structured data", () => {
  const data = buildJsonLd(live, {
    email: "name@example.com",
    linkedin: "https://www.linkedin.com/in/example/",
    github: "https://github.com/example",
    resume: null,
  });

  it("links a Person, a WebSite and a ProfilePage", () => {
    expect(data["@context"]).toBe("https://schema.org");
    expect(graph(data).map((node) => node["@type"]).sort()).toEqual(["Person", "ProfilePage", "WebSite"]);
    expect(byType(data, "ProfilePage").mainEntity).toEqual({ "@id": "https://www.example.com/#person" });
  });

  it("describes the person only with facts the page states", () => {
    const person = byType(data, "Person");
    expect(person).toMatchObject({
      name: profile.name,
      jobTitle: profile.title,
      url: "https://www.example.com/",
      image: "https://www.example.com/images/subash-rodrigo.jpg",
      worksFor: { "@type": "Organization", name: "Creative Software" },
      alumniOf: [{ "@type": "CollegeOrUniversity", name: "University of Kelaniya, Sri Lanka" }],
      sameAs: ["https://www.linkedin.com/in/example/", "https://github.com/example"],
      email: "mailto:name@example.com",
    });
    expect(person.knowsAbout).toEqual(expect.arrayContaining(["React", "Angular", "TypeScript"]));
  });

  it("leaves out contact details that are not published", () => {
    const person = byType(buildJsonLd(live, { email: null, linkedin: null, github: null, resume: null }), "Person");
    expect(person).not.toHaveProperty("sameAs");
    expect(person).not.toHaveProperty("email");
  });

  it("cannot break out of its script tag", () => {
    expect(jsonLdScript({ text: "</script><script>alert(1)</script>" })).not.toContain("</script>");
  });
});
