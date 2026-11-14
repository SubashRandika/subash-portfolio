import type { SkillGroup } from "@/types/portfolio";

/**
 * Technical expertise.
 *
 * Limited to the expertise and technologies named in the brief. Nothing is
 * inferred (for example, no backend languages or cloud providers are listed
 * because none were stated).
 */
export const skillGroups: readonly SkillGroup[] = [
  {
    id: "languages-frameworks",
    title: "Languages and frameworks",
    skills: ["TypeScript", "JavaScript", "React", "Next.js", "Angular"],
  },
  {
    id: "architecture",
    title: "Architecture",
    skills: [
      "Frontend architecture",
      "Micro-frontend architecture",
      "Design systems",
      "Reusable component libraries",
      "Enterprise applications",
      "SaaS platforms",
      "Full-stack application development",
    ],
  },
  {
    id: "quality",
    title: "Quality",
    skills: [
      "Accessibility",
      "Internationalization",
      "Automated testing",
      "Unit testing and code coverage",
      "Storybook",
      "Performance optimization",
    ],
  },
  {
    id: "leadership",
    title: "Leadership",
    skills: [
      "Technical leadership",
      "Mentoring",
      "Architectural decisions",
      "International team collaboration",
    ],
  },
  {
    id: "platforms",
    title: "Also worked with",
    skills: ["Firebase Authentication", "Pentaho BI", "WSO2 ESB", "Microservices"],
  },
];
