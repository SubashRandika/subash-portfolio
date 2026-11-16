/**
 * What must be true before the site goes to production.
 *
 * Imported by next.config.ts with relative paths only (the config is loaded
 * before the "@/" alias exists), so keep this module's imports relative or
 * type-only.
 */

import { profile } from "../data/profile";
import { canBeContacted, resolveContact } from "./contact";
import { resolveSiteUrl } from "./site";

type Environment = Record<string, string | undefined>;

/** Reasons the build must not be deployed to production; empty when it may. */
export function deploymentProblems(env: Environment): string[] {
  const problems: string[] = [];

  const siteUrl = resolveSiteUrl(env.NEXT_PUBLIC_SITE_URL);
  if (!siteUrl.isConfigured) {
    problems.push(
      `${siteUrl.problem ?? "NEXT_PUBLIC_SITE_URL is not usable."} Set it to the production origin, e.g. https://www.example.com.`,
    );
  }

  const contact = resolveContact(profile.links, env);
  problems.push(...contact.problems);
  if (!canBeContacted(contact.links)) {
    problems.push("There is no way to get in touch: set an email, LinkedIn or GitHub address.");
  }

  return problems;
}

/** True for a production deployment: Vercel's production environment, or DEPLOY_ENV=production. */
export function isProductionDeploy(env: Environment): boolean {
  return env.VERCEL_ENV === "production" || env.DEPLOY_ENV === "production";
}
