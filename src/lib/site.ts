/**
 * Site-wide configuration.
 *
 * The production domain is intentionally not hardcoded anywhere: it comes
 * from NEXT_PUBLIC_SITE_URL. When that variable is missing or invalid the
 * site still builds (so local work and previews are possible) but reports
 * itself as "not configured", which later phases use to withhold canonical
 * URLs and to tell crawlers not to index the build.
 */

export const LOCAL_FALLBACK_ORIGIN = "http://localhost:3000";

export interface SiteUrlResolution {
  /** Origin to build absolute URLs from. Never has a trailing slash. */
  origin: string;
  /** True only when NEXT_PUBLIC_SITE_URL holds a valid, deployable origin. */
  isConfigured: boolean;
  /** Human-readable reason when `isConfigured` is false. */
  problem?: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveSiteUrl(raw: string | undefined): SiteUrlResolution {
  const value = raw?.trim();
  if (!value) {
    return {
      origin: LOCAL_FALLBACK_ORIGIN,
      isConfigured: false,
      problem: "NEXT_PUBLIC_SITE_URL is not set.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return {
      origin: LOCAL_FALLBACK_ORIGIN,
      isConfigured: false,
      problem: `NEXT_PUBLIC_SITE_URL is not a valid absolute URL: "${value}".`,
    };
  }

  const isLocal = LOCAL_HOSTS.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    return {
      origin: LOCAL_FALLBACK_ORIGIN,
      isConfigured: false,
      problem: "NEXT_PUBLIC_SITE_URL must use https (http is allowed for localhost only).",
    };
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return {
      origin: LOCAL_FALLBACK_ORIGIN,
      isConfigured: false,
      problem: "NEXT_PUBLIC_SITE_URL must be a bare origin without a path, query or hash.",
    };
  }

  return {
    origin: parsed.origin,
    // A localhost origin is usable for previews but is never a deployable domain.
    isConfigured: !isLocal,
    problem: isLocal ? "NEXT_PUBLIC_SITE_URL points at localhost." : undefined,
  };
}

export const site = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

/** Builds an absolute URL for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${site.origin}/`).toString();
}
