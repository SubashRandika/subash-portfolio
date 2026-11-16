import type { Project } from "@/types/portfolio";

/**
 * Selected projects.
 *
 * These are professional descriptions only. No project URLs, screenshots or
 * client material are included because none have been authorized.
 */
export const projects: readonly Project[] = [
  {
    id: "green-button-go-scheduler",
    name: "Green Button Go Scheduler",
    client: "Biosero",
    via: "Creative Software",
    summary: "A laboratory scheduling platform for optimizing devices, instruments and workcells.",
    contributions: [
      "Laboratory scheduling platform",
      "Optimizing devices, instruments and workcells",
      "Enterprise application engineering",
    ],
    chapter: 6,
  },
  {
    id: "cloud-portal-saas",
    name: "Cloud Portal SaaS",
    client: "Biosero",
    via: "Creative Software",
    summary: "A SaaS platform for managing subscriptions, licenses and software packages.",
    contributions: [
      "Subscription management",
      "License management",
      "Software packages",
      "SaaS platform development",
    ],
    chapter: 6,
  },
  {
    id: "ifs-cloud-home",
    name: "IFS Cloud Home and design system",
    client: "IFS",
    via: "Creative Software",
    summary:
      "IFS Cloud Home widgets, micro-frontend architecture, and the design system and component libraries.",
    contributions: [
      "IFS Cloud Home widgets",
      "Micro-frontend architecture",
      "Angular and React development",
      "Granite Angular Component Library, IFS Design System and Shared Component Library",
      "Accessibility and internationalization",
      "Drag-and-drop dashboard layout proof of concept",
      "Storybook and automated testing",
    ],
    chapter: 5,
  },
  {
    id: "finago-flow-nest",
    name: "Finago Flow and Nest",
    client: "Finago",
    via: "Creative Software",
    summary: "Rebranding and UI improvements for Finago Flow/Nest.",
    contributions: [
      "Rebranding and UI improvements",
      "Reusable nested stepper component",
      "Simplified customer-creation wizard, improving the user experience by approximately 50%",
    ],
    chapter: 5,
  },
  {
    id: "atlas-2",
    name: "Atlas 2.0",
    client: "Geposit",
    via: "Ascentic",
    summary: "Complex data visualization and mapping capabilities, with large-scale dataset handling.",
    contributions: [
      "Import/export wizard for datasets of more than 500,000 records",
      "Interactive 3D markers",
      "Firebase authentication",
    ],
    chapter: 4,
  },
  {
    id: "workheld-sense",
    name: "Workheld Sense",
    client: "Senseforce GmbH",
    via: "Paze Industries",
    summary: "Industrial software: dashboards, widgets, and Script and Dataset functionality.",
    contributions: [
      "Dashboard development and widgets",
      "Script and Dataset functionality",
      "Unit tests and code coverage",
      "Resolution of a critical theme-customization issue",
    ],
    chapter: 3,
  },
  {
    id: "qmatic",
    name: "Qmatic solutions",
    client: "Qmatic AB",
    via: "Creative Software",
    summary: "Services and reporting for Qmatic, delivered while moving into technical leadership.",
    contributions: [
      "URL-shortener microservice",
      "Feedback survey and reporting solution",
      "Orchestra and Pentaho BI",
      "Performance optimization from 10 seconds to 4 seconds on slow 3G connections",
    ],
    chapter: 2,
  },
  {
    id: "mydashboard",
    name: "MyDashboard",
    client: "Pearson",
    via: null,
    summary: "UI development for MyDashboard, a Pearson product (2015–2017).",
    contributions: ["Advanced filtering functionality for MyDashboard"],
    chapter: 1,
  },
  {
    id: "wso2-connectors",
    name: "WSO2 ESB cloud connectors",
    client: "WSO2",
    via: null,
    summary: "Enterprise integration work at the start of my career (2013–2015).",
    contributions: ["Close to 200 WSO2 ESB cloud connectors"],
    chapter: 1,
  },
];
