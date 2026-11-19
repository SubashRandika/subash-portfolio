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
  closingMessage: ["The journey continues.", "Your next project could be our next chapter."],
  summary: [
    "I am a lead software engineer with 13+ years of software development experience across enterprise applications and SaaS platforms.",
    "My work centres on React, Next.js, Angular and TypeScript: frontend architecture, micro-frontends, design systems and reusable component libraries, built to be accessible, internationalized, tested and fast.",
    "I lead and mentor engineers, make architectural decisions, and collaborate with international development teams.",
  ],
  links: {
    linkedin: "https://www.linkedin.com/in/subash-rodrigo/",
    github: "https://github.com/SubashRandika",
    email: "subash.rodrigo@gmail.com",
    resume: "/resume.pdf",
  },
  education: [
    {
      institution: "University of Kelaniya, Sri Lanka",
      qualification: "Bachelor of Science in Computer Science (Special)",
      period: "Graduated 2013",
    },
  ],
};
