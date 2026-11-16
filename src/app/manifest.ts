import type { MetadataRoute } from "next";
import { profile } from "@/data/profile";
import { SITE_DESCRIPTION } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${profile.name}, ${profile.title}`,
    short_name: profile.name,
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "browser",
    background_color: "#070b14",
    theme_color: "#070b14",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
