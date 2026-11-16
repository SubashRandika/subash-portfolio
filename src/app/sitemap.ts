import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** The portfolio is one page; its sections are fragments of it. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 }];
}
