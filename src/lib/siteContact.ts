import { profile } from "@/data/profile";
import { resolveContact } from "./contact";

/**
 * The contact details the site publishes: the data file, overridden by
 * deployment environment variables, validated. Each variable is read by name
 * so Next.js can inline it at build time.
 */
export const siteContact = resolveContact(profile.links, {
  NEXT_PUBLIC_CONTACT_EMAIL: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
  NEXT_PUBLIC_LINKEDIN_URL: process.env.NEXT_PUBLIC_LINKEDIN_URL,
  NEXT_PUBLIC_GITHUB_URL: process.env.NEXT_PUBLIC_GITHUB_URL,
  NEXT_PUBLIC_RESUME_URL: process.env.NEXT_PUBLIC_RESUME_URL,
});

for (const problem of siteContact.problems) {
  console.warn(`[contact] ${problem}`);
}
