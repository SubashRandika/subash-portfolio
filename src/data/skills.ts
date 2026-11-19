import type { SkillGroup } from "@/types/portfolio";

/**
 * Practices: how Subash works, as opposed to the tools he works with (those
 * are in technologies.ts). From the brief and the résumé; nothing inferred.
 */
export const skillGroups: readonly SkillGroup[] = [
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
      "Microservices",
      "REST APIs",
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
    id: "ways-of-working",
    title: "Ways of working",
    skills: ["Agile (Scrum)", "Kanban", "Code review", "Technical interviewing"],
  },
];
