import { CHAPTER_RANGES } from "@/flight/timeline";
import type { Chapter } from "@/types/portfolio";

/**
 * The six career chapters.
 *
 * Every statement here restates a fact from the project brief. Summaries are
 * intentionally plain: nothing is added about scope, team size, outcomes or
 * technology beyond what Subash supplied.
 *
 * Withheld pending confirmation (see PROJECT_PROGRESS.md):
 * - Finago "approximately 50% UX improvement".
 */
export const chapters: readonly Chapter[] = [
  {
    number: 1,
    id: "chapter-01",
    title: "First Takeoff",
    period: "2013–2017",
    organisation: "Pearson / WSO2",
    product: null,
    destination: "Pearson / WSO2",
    environment: "Tropical coastal runway and green countryside",
    narrative: "The beginning of my engineering journey.",
    range: CHAPTER_RANGES[1],
    milestones: [
      {
        id: "career-start",
        title: "Career begins",
        summary: "Started as a Software Engineer in June 2013.",
      },
      {
        id: "enterprise-software",
        title: "Enterprise software",
        summary: "Enterprise software development across the first chapter of my career.",
      },
      {
        id: "mydashboard-filtering",
        title: "MyDashboard advanced filtering",
        summary: "Advanced filtering functionality for MyDashboard.",
      },
      {
        id: "wso2-connectors",
        title: "Close to 200 cloud connectors",
        summary: "Close to 200 WSO2 ESB cloud connectors.",
      },
    ],
  },
  {
    number: 2,
    id: "chapter-02",
    title: "Building Momentum",
    period: "2017–2021",
    organisation: "Creative Software / Qmatic AB",
    product: null,
    destination: "Qmatic AB",
    environment: "Green mountain valleys, forests and rivers",
    narrative:
      "Moving from software engineering into technical leadership and building solutions at scale.",
    range: CHAPTER_RANGES[2],
    milestones: [
      {
        id: "technical-leadership",
        title: "Technical leadership",
        summary: "Took on technical leadership responsibilities as Associate Technical Lead.",
      },
      {
        id: "url-shortener",
        title: "URL-shortener microservice",
      },
      {
        id: "feedback-survey",
        title: "Feedback survey and reporting",
      },
      {
        id: "orchestra-pentaho",
        title: "Orchestra and Pentaho BI",
      },
      {
        id: "performance-3g",
        title: "10 seconds to 4 seconds on slow 3G",
        summary: "Performance optimization from 10 seconds to 4 seconds on slow 3G connections.",
      },
    ],
  },
  {
    number: 3,
    id: "chapter-03",
    title: "A New Horizon",
    period: "October–December 2021",
    organisation: "Paze Industries / Senseforce GmbH",
    product: "Workheld Sense",
    destination: "Senseforce GmbH",
    environment: "Industrial region with factories, warehouses and logistics infrastructure",
    narrative: "Exploring new technical challenges and industrial software solutions.",
    range: CHAPTER_RANGES[3],
    milestones: [
      {
        id: "dashboards",
        title: "Dashboard development",
        summary: "Dashboard development for Workheld Sense.",
      },
      {
        id: "widgets",
        title: "Widgets",
      },
      {
        id: "script-dataset",
        title: "Script and Dataset functionality",
      },
      {
        id: "unit-tests",
        title: "Unit tests and code coverage",
      },
      {
        id: "theme-customization",
        title: "Critical theme-customization fix",
        summary: "Resolved a critical theme-customization issue.",
      },
    ],
  },
  {
    number: 4,
    id: "chapter-04",
    title: "Mapping New Possibilities",
    period: "January–March 2022",
    organisation: "Ascentic / Geposit",
    product: "Atlas 2.0",
    destination: "Geposit",
    environment: "Geographical terrain with ridges, rivers, roads and forests",
    narrative:
      "Building solutions that connect software engineering with geographical intelligence.",
    range: CHAPTER_RANGES[4],
    milestones: [
      {
        id: "import-export-wizard",
        title: "Import and export wizard for 500,000+ records",
        summary: "A large-scale dataset import/export wizard handling more than 500,000 records.",
      },
      {
        id: "3d-markers",
        title: "Interactive 3D markers",
      },
      {
        id: "firebase-auth",
        title: "Firebase authentication",
      },
      {
        id: "data-visualization",
        title: "Data visualization and mapping",
        summary: "Complex data visualization and mapping capabilities.",
      },
    ],
  },
  {
    number: 5,
    id: "chapter-05",
    title: "Engineering at Scale",
    period: "March 2022–Present",
    organisation: "Creative Software / IFS and Finago",
    product: null,
    destination: "IFS and Finago",
    environment: "Modern city with rivers, bridges, parks and business districts",
    narrative:
      "Building enterprise-grade frontend platforms, scalable architecture, and reusable design systems.",
    range: CHAPTER_RANGES[5],
    milestones: [
      {
        id: "ifs-cloud-home",
        group: "IFS",
        title: "IFS Cloud Home widgets",
        summary: "IFS Cloud Home widgets and micro-frontend architecture, in Angular and React.",
        points: ["IFS Cloud Home widgets", "Micro-frontend architecture", "Angular and React development"],
      },
      {
        id: "ifs-design-system",
        group: "IFS",
        title: "Design system and component libraries",
        summary:
          "The Granite Angular Component Library, the IFS Design System and the Shared Component Library.",
        points: ["Granite Angular Component Library", "IFS Design System", "Shared Component Library"],
      },
      {
        id: "ifs-a11y-i18n",
        group: "IFS",
        title: "Accessibility and internationalization",
      },
      {
        id: "ifs-dashboard-poc",
        group: "IFS",
        title: "Drag-and-drop dashboard layout",
        summary: "A proof of concept for a drag-and-drop dashboard layout.",
      },
      {
        id: "ifs-storybook-testing",
        group: "IFS",
        title: "Storybook and automated testing",
      },
      {
        id: "ifs-leadership",
        group: "IFS",
        title: "Technical leadership and mentoring",
        summary: "Technical leadership and mentoring as Technical Lead.",
      },
      {
        id: "finago-rebranding",
        group: "Finago",
        title: "Flow and Nest rebranding",
        summary: "Finago Flow/Nest rebranding and UI improvements.",
      },
      {
        id: "finago-stepper",
        group: "Finago",
        title: "Reusable nested stepper",
      },
      {
        id: "finago-wizard",
        group: "Finago",
        title: "Customer-creation wizard",
      },
    ],
  },
  {
    number: 6,
    id: "chapter-06",
    title: "Leading the Mission",
    period: "Current",
    organisation: "Creative Software / Biosero",
    product: null,
    destination: "Biosero",
    environment: "Above the clouds, distant mountains and a sunrise horizon",
    narrative:
      "Leading engineering initiatives, building enterprise SaaS solutions, and preparing for the next professional mission.",
    range: CHAPTER_RANGES[6],
    milestones: [
      {
        id: "gbg-scheduler",
        group: "Green Button Go Scheduler",
        title: "Laboratory scheduling platform",
        summary:
          "A laboratory scheduling platform for optimizing devices, instruments and workcells.",
        points: [
          "Laboratory scheduling platform",
          "Optimizing devices, instruments and workcells",
          "Enterprise application engineering",
        ],
      },
      {
        id: "cloud-portal",
        group: "Cloud Portal SaaS",
        title: "Subscriptions, licenses and software packages",
        summary:
          "A SaaS platform covering subscription management, license management and software packages.",
        points: [
          "Subscription management",
          "License management",
          "Software packages",
          "SaaS platform development",
        ],
      },
      {
        id: "leadership",
        title: "Leading an international team",
        summary:
          "Technical leadership, architectural decisions and mentoring while leading and collaborating with an international development team.",
        points: [
          "Technical leadership",
          "Architectural decisions",
          "Mentoring engineers",
          "Leading and collaborating with an international development team",
        ],
      },
    ],
  },
];

export function getChapter(number: Chapter["number"]): Chapter {
  const chapter = chapters.find((c) => c.number === number);
  if (!chapter) throw new Error(`Unknown chapter ${number}`);
  return chapter;
}
