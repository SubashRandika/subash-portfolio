import type { Profile } from "@/types/portfolio";

/**
 * Personal profile.
 *
 * `null` values are facts Subash has not supplied yet. They are listed under
 * "Outstanding questions" in PROJECT_PROGRESS.md and are not rendered.
 */
export const profile: Profile = {
  name: "Subash Rodrigo",
  // Working assumption: matches the page title requested in the brief.
  title: "Lead Software Engineer",
  yearsOfExperience: "13+",
  careerStartYear: 2013,
  tagline: ["Every journey begins with a takeoff.", "Mine began in 2013."],
  closingMessage: ["The journey continues.", "The next mission could be ours."],
  summary: [
    "I am a lead software engineer with 13+ years of software development experience across enterprise applications and SaaS platforms.",
    "My work centres on React, Next.js, Angular and TypeScript: frontend architecture, micro-frontends, design systems and reusable component libraries, built to be accessible, internationalized, tested and fast.",
    "I lead and mentor engineers, make architectural decisions, and collaborate with international development teams.",
  ],
  links: {
    linkedin: null,
    github: null,
    email: null,
    resume: null,
  },
  education: [],
};
