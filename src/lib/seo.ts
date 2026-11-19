/**
 * Search and sharing metadata, and structured data (JSON-LD).
 *
 * Everything here is built from the typed content in src/data and the
 * validated contact details, so it can never say more than the page does.
 * Absolute URLs come from NEXT_PUBLIC_SITE_URL; until a real domain is set
 * the site asks not to be indexed and publishes no canonical URL.
 */

import type { Metadata } from "next";
import { experience } from "@/data/experience";
import { profile } from "@/data/profile";
import { skillGroups } from "@/data/skills";
import { technologies } from "@/data/technologies";
import type { ContactDetails } from "./contact";
import { type SiteUrlResolution, site } from "./site";
import { siteContact } from "./siteContact";

export const SITE_TITLE = "Subash Rodrigo | Lead Software Engineer | React, Angular & Full-Stack";

export const SITE_DESCRIPTION =
  "Subash Rodrigo is a Lead Software Engineer with 13+ years of experience building high-performance web applications, enterprise software, React, Angular, SaaS platforms and scalable digital experiences.";

/** The sharing image (public/og-image.png, made by scripts/build-brand-assets.mjs). */
export const SHARING_IMAGE = {
  path: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Subash Rodrigo, Lead Software Engineer: 13+ years building enterprise web platforms, design systems and SaaS with React, Angular and TypeScript.",
} as const;

/** The portrait at a stable URL, for structured data. */
export const PORTRAIT_PATH = "/images/subash-rodrigo.jpg";

const absolute = (resolution: SiteUrlResolution, path: string) =>
  new URL(path, `${resolution.origin}/`).toString();

/** Page metadata for the home page and the defaults for every route. */
export function buildMetadata(resolution: SiteUrlResolution = site): Metadata {
  const [firstName = profile.name, ...rest] = profile.name.split(" ");
  return {
    metadataBase: new URL(resolution.origin),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    applicationName: profile.name,
    authors: [{ name: profile.name, url: resolution.origin }],
    creator: profile.name,
    category: "technology",
    // A canonical URL only means something on the real domain.
    alternates: resolution.isConfigured ? { canonical: "/" } : undefined,
    // Previews and builds without a domain stay out of search results.
    robots: resolution.isConfigured
      ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } }
      : { index: false, follow: false },
    openGraph: {
      type: "profile",
      url: "/",
      siteName: profile.name,
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      locale: "en",
      firstName,
      lastName: rest.join(" ") || undefined,
      images: [
        {
          url: SHARING_IMAGE.path,
          width: SHARING_IMAGE.width,
          height: SHARING_IMAGE.height,
          alt: SHARING_IMAGE.alt,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [{ url: SHARING_IMAGE.path, alt: SHARING_IMAGE.alt }],
    },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

type JsonLd = Record<string, unknown>;

/**
 * Person, WebSite and ProfilePage, linked by @id. Only facts already on the
 * page: name, title, summary, portrait, current employer, education,
 * expertise and the published contact details.
 */
export function buildJsonLd(
  resolution: SiteUrlResolution = site,
  links: ContactDetails = siteContact.links,
): JsonLd {
  const home = absolute(resolution, "/");
  const id = (fragment: string) => `${home}#${fragment}`;
  const current = experience.find((entry) => entry.end === null);
  const sameAs = [links.linkedin, links.github].filter((url): url is string => Boolean(url));
  const expertise = [
    ...technologies.map((tech) => tech.name),
    ...skillGroups.flatMap((group) => group.skills),
  ];

  const person: JsonLd = {
    "@type": "Person",
    "@id": id("person"),
    name: profile.name,
    jobTitle: profile.title,
    description: profile.summary[0],
    url: home,
    image: absolute(resolution, PORTRAIT_PATH),
    knowsAbout: expertise,
  };
  if (sameAs.length > 0) person.sameAs = sameAs;
  if (links.email) person.email = `mailto:${links.email}`;
  if (current?.employer) person.worksFor = { "@type": "Organization", name: current.employer };
  if (profile.education.length > 0) {
    person.alumniOf = profile.education.map((entry) => ({
      "@type": "CollegeOrUniversity",
      name: entry.institution,
    }));
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": id("website"),
        url: home,
        name: profile.name,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": id("person") },
      },
      {
        "@type": "ProfilePage",
        "@id": id("profile"),
        url: home,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        isPartOf: { "@id": id("website") },
        mainEntity: { "@id": id("person") },
        primaryImageOfPage: { "@type": "ImageObject", url: absolute(resolution, PORTRAIT_PATH) },
      },
      person,
    ],
  };
}

/** JSON-LD as safe inline script text: "<" is escaped so it cannot close the tag. */
export function jsonLdScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
