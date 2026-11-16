import type { ExperienceEntry } from "@/types/portfolio";

/**
 * Full work experience, newest first.
 *
 * Employer and client are separate fields on purpose: Creative Software,
 * Paze Industries and Ascentic are employers; Qmatic, Senseforce, Geposit,
 * IFS, Finago and Biosero are client or product engagements.
 *
 * In 2013–2017 WSO2 (2013–2015) and Pearson (2015–2017) were clients; the
 * employer for that period has not been named, so none is shown.
 * Engagement roles are from the résumé. No dates are given for the
 * individual IFS, Finago or Biosero engagements, so none are shown.
 */
export const experience: readonly ExperienceEntry[] = [
  {
    id: "creative-software-2022",
    start: "2022-03-15",
    end: null,
    role: "Technical Lead",
    employer: "Creative Software",
    engagements: [
      { client: "Biosero", role: "Lead Software Engineer" },
      { client: "IFS", role: "Senior Lead Front-End Engineer" },
      { client: "Finago", role: "Lead Front-End Engineer" },
    ],
    highlights: [
      "Biosero: Green Button Go Scheduler, a laboratory scheduling platform for optimizing devices, instruments and workcells.",
      "Biosero: Cloud Portal SaaS for subscription management, license management and software packages.",
      "IFS: IFS Cloud Home widgets, micro-frontend architecture, Angular and React development.",
      "IFS: Granite Angular Component Library, IFS Design System and Shared Component Library.",
      "IFS: accessibility, internationalization, Storybook and automated testing.",
      "IFS: drag-and-drop dashboard layout proof of concept.",
      "IFS: technical leadership and mentoring.",
      "Finago: Flow/Nest rebranding and UI improvements, a reusable nested stepper component, and a simplified customer-creation wizard that improved the user experience by approximately 50%.",
      "Biosero: technical leadership, architectural decisions, mentoring engineers, and leading and collaborating with an international development team.",
    ],
    chapters: [5, 6],
  },
  {
    id: "ascentic-2022",
    start: "2022-01-01",
    end: "2022-03-14",
    role: "Associate Technical Lead",
    employer: "Ascentic",
    engagements: [{ client: "Geposit", product: "Atlas 2.0", role: "Front-End Developer" }],
    highlights: [
      "Large-scale dataset import/export wizard handling more than 500,000 records.",
      "Interactive 3D markers.",
      "Firebase authentication.",
      "Complex data visualization and mapping capabilities.",
    ],
    chapters: [4],
  },
  {
    id: "paze-industries-2021",
    start: "2021-10-04",
    end: "2021-12-31",
    role: "Senior Software Engineer",
    employer: "Paze Industries",
    engagements: [
      {
        client: "Senseforce GmbH",
        product: "Workheld Sense",
        role: "Senior Software Engineer (Front-End)",
      },
    ],
    highlights: [
      "Dashboard development and widgets.",
      "Script and Dataset functionality.",
      "Unit tests and code coverage.",
      "Resolved a critical theme-customization issue.",
    ],
    chapters: [3],
  },
  {
    id: "creative-software-2017",
    start: "2017-04-17",
    end: "2021-09-30",
    role: "Associate Technical Lead",
    employer: "Creative Software",
    engagements: [{ client: "Qmatic AB", role: "Software Engineer (Full-Stack)" }],
    highlights: [
      "Technical leadership responsibilities.",
      "URL-shortener microservice.",
      "Feedback survey and reporting solution.",
      "Orchestra and Pentaho BI.",
      "Performance optimization from 10 seconds to 4 seconds on slow 3G connections.",
    ],
    chapters: [2],
  },
  {
    id: "pearson-wso2-2013",
    start: "2013-06-17",
    end: "2017-04-14",
    role: "Software Engineer",
    employer: null,
    engagements: [
      { client: "WSO2", period: "2013–2015" },
      { client: "Pearson", period: "2015–2017" },
    ],
    highlights: [
      "Enterprise software development.",
      "WSO2: close to 200 WSO2 ESB cloud connectors.",
      "Pearson: advanced filtering functionality for MyDashboard.",
    ],
    chapters: [1],
  },
];
