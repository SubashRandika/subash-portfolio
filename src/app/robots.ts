import type { MetadataRoute } from "next";
import { absoluteUrl, site } from "@/lib/site";

/**
 * Crawl rules. Until NEXT_PUBLIC_SITE_URL names the real domain, nothing is
 * indexed, so previews and stray builds never compete with the live site.
 * Internal design pages are never crawled.
 */
export default function robots(): MetadataRoute.Robots {
  if (!site.isConfigured) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/lab/", "/styleguide"] },
    sitemap: absoluteUrl("/sitemap.xml"),
    host: site.origin,
  };
}
