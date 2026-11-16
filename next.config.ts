import type { NextConfig } from "next";
import { deploymentProblems, isProductionDeploy } from "./src/lib/deploy-check";

// A production deployment needs a real domain (canonical URLs, sitemap,
// sharing cards and structured data are built from it) and a way to get in
// touch. Refuse to build one without them. Previews and local builds are
// unaffected. See docs/DEPLOYMENT.md.
if (isProductionDeploy(process.env)) {
  const problems = deploymentProblems(process.env);
  if (problems.length > 0) {
    const list = problems.map((problem) => `  - ${problem}`).join("\n");
    throw new Error(`Production build refused:\n${list}`);
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
