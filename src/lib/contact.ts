/**
 * Contact details and the résumé.
 *
 * None of these are invented: they come either from `src/data/profile.ts` or
 * from environment variables set at deployment, so they can be supplied
 * without a code change:
 *
 *   NEXT_PUBLIC_CONTACT_EMAIL   e.g. name@example.com
 *   NEXT_PUBLIC_LINKEDIN_URL    https://www.linkedin.com/in/…
 *   NEXT_PUBLIC_GITHUB_URL      https://github.com/…
 *   NEXT_PUBLIC_RESUME_URL      /resume.pdf (a file in public/) or an https URL to a PDF
 *
 * An environment value wins over the data file. Values that fail validation
 * are dropped and reported, never rendered.
 */

import type { Profile } from "@/types/portfolio";

export type ContactDetails = Profile["links"];

export interface ContactResolution {
  links: ContactDetails;
  /** Why a supplied value was rejected. */
  problems: string[];
}

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function httpsUrl(value: string, hosts: readonly string[]): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`)) ? url : null;
  } catch {
    return null;
  }
}

export function validEmail(value: string): string | null {
  const trimmed = value.trim();
  return EMAIL.test(trimmed) ? trimmed : null;
}

export function validLinkedIn(value: string): string | null {
  const url = httpsUrl(value.trim(), ["linkedin.com"]);
  return url && url.pathname.length > 1 ? url.toString() : null;
}

export function validGitHub(value: string): string | null {
  const url = httpsUrl(value.trim(), ["github.com"]);
  return url && url.pathname.length > 1 ? url.toString() : null;
}

/** The name the résumé is saved under when downloaded. */
export const RESUME_FILE_NAME = "Subash-Rodrigo-Resume.pdf";

/** A PDF in public/ ("/resume.pdf") or on an https URL. */
export function validResume(value: string): string | null {
  const trimmed = value.trim();
  if (/^\/[\w\-./]+\.pdf$/i.test(trimmed) && !trimmed.includes("..")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && /\.pdf$/i.test(url.pathname) ? url.toString() : null;
  } catch {
    return null;
  }
}

type Environment = Record<string, string | undefined>;

export function resolveContact(data: ContactDetails, env: Environment): ContactResolution {
  const problems: string[] = [];
  const pick = (
    label: string,
    envName: string,
    fromData: string | null,
    validate: (value: string) => string | null,
  ): string | null => {
    const raw = env[envName]?.trim() || fromData;
    if (!raw) return null;
    const valid = validate(raw);
    if (!valid) problems.push(`${label} ("${raw}") is not valid and is not shown.`);
    return valid;
  };

  return {
    links: {
      email: pick("Email", "NEXT_PUBLIC_CONTACT_EMAIL", data.email, validEmail),
      linkedin: pick("LinkedIn URL", "NEXT_PUBLIC_LINKEDIN_URL", data.linkedin, validLinkedIn),
      github: pick("GitHub URL", "NEXT_PUBLIC_GITHUB_URL", data.github, validGitHub),
      resume: pick("Résumé", "NEXT_PUBLIC_RESUME_URL", data.resume, validResume),
    },
    problems,
  };
}

/** True when a visitor has at least one way to get in touch. */
export function canBeContacted(links: ContactDetails): boolean {
  return Boolean(links.email || links.linkedin || links.github);
}
