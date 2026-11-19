/**
 * The technologies Subash has worked with, as listed in his résumé
 * (Competencies & Skills), grouped as the résumé groups them.
 *
 * No proficiency levels or years are given here because the résumé gives
 * none. `core` marks the primary expertise named in the project brief.
 *
 * Icons are Devicon (https://devicon.dev, MIT licence), or Simple Icons
 * (https://simpleicons.org, CC0) where Devicon has none, copied into
 * public/tech/ by scripts/copy-tech-icons.mjs. `icon` is the icon's name, or
 * null where neither has one; those tiles show their symbol alone.
 */

export type TechFamily = "languages" | "frontend" | "backend" | "delivery" | "tools";

export interface TechFamilyInfo {
  id: TechFamily;
  title: string;
}

export const TECH_FAMILIES: readonly TechFamilyInfo[] = [
  { id: "languages", title: "Languages and markup" },
  { id: "frontend", title: "Frontend" },
  { id: "backend", title: "Backend and data" },
  { id: "delivery", title: "Testing, build and DevOps" },
  { id: "tools", title: "Tools and AI" },
];

export interface Technology {
  id: string;
  name: string;
  /** Two-letter symbol, as on a periodic table. */
  symbol: string;
  family: TechFamily;
  /** Icon name (public/tech/<icon>.svg), or null where there is none. */
  icon: string | null;
  /** Primary expertise named in the brief. */
  core?: boolean;
}

const t = (
  family: TechFamily,
  id: string,
  name: string,
  symbol: string,
  icon: string | null,
  core = false,
): Technology => (core ? { id, name, symbol, family, icon, core } : { id, name, symbol, family, icon });

export const technologies: readonly Technology[] = [
  // Languages and markup
  t("languages", "typescript", "TypeScript", "Ts", "typescript", true),
  t("languages", "javascript", "JavaScript", "Js", "javascript", true),
  t("languages", "java", "Java", "Jv", "java"),
  t("languages", "csharp", "C#", "C#", "csharp"),
  t("languages", "html", "HTML", "Ht", "html5"),
  t("languages", "css", "CSS", "Cs", "css3"),
  t("languages", "scss", "SCSS", "Sc", "sass"),

  // Frontend
  t("frontend", "react", "React", "Re", "react", true),
  t("frontend", "angular", "Angular", "An", "angular", true),
  t("frontend", "nextjs", "Next.js", "Nx", "nextjs", true),
  t("frontend", "blazor", "Blazor", "Bz", "blazor"),
  t("frontend", "redux", "Redux Toolkit", "Rx", "redux"),
  t("frontend", "tanstack", "TanStack Query / Table", "Tq", "reactquery"),
  t("frontend", "zustand", "Zustand", "Zu", "zustand"),
  t("frontend", "storybook", "Storybook", "Sb", "storybook"),
  t("frontend", "shadcn", "shadcn/ui", "Sh", "shadcn"),
  t("frontend", "tailwind", "Tailwind CSS", "Tw", "tailwindcss"),
  t("frontend", "materialui", "Material UI", "Mu", "materialui"),
  t("frontend", "antdesign", "Ant Design", "Ad", "antdesign"),
  t("frontend", "bootstrap", "Bootstrap", "Bs", "bootstrap"),

  // Backend and data
  t("backend", "nodejs", "Node.js", "No", "nodejs"),
  t("backend", "express", "Express.js", "Ex", "express"),
  t("backend", "spring", "Spring Boot", "Sp", "spring"),
  t("backend", "hibernate", "Hibernate", "Hb", "hibernate"),
  t("backend", "graphql", "GraphQL", "Gq", "graphql"),
  t("backend", "mongodb", "MongoDB", "Mg", "mongodb"),
  t("backend", "firebase", "Firebase", "Fb", "firebase"),
  t("backend", "postgresql", "PostgreSQL", "Pg", "postgresql"),
  t("backend", "oracle", "Oracle", "Or", "oracle"),
  t("backend", "sqlserver", "MS SQL Server", "Ms", "microsoftsqlserver"),
  t("backend", "superset", "Superset", "Su", "apachesuperset"),
  t("backend", "elasticsearch", "Elasticsearch", "El", "elasticsearch"),
  t("backend", "tomcat", "Apache Tomcat", "Tc", "tomcat"),

  // Testing, build and DevOps
  t("delivery", "vitest", "Vitest", "Vt", "vitest"),
  t("delivery", "jest", "Jest", "Je", "jest"),
  t("delivery", "testinglibrary", "Testing Library", "Tl", "testinglibrary"),
  t("delivery", "cypress", "Cypress", "Cy", "cypressio"),
  t("delivery", "junit", "JUnit", "Ju", "junit"),
  t("delivery", "vite", "Vite", "Vi", "vitejs"),
  t("delivery", "webpack", "Webpack", "Wp", "webpack"),
  t("delivery", "maven", "Maven", "Mv", "maven"),
  t("delivery", "gradle", "Gradle", "Gr", "gradle"),
  t("delivery", "jenkins", "Jenkins", "Jk", "jenkins"),
  t("delivery", "docker", "Docker", "Dk", "docker"),
  t("delivery", "aws", "AWS", "Aw", "amazonwebservices"),
  t("delivery", "git", "Git", "Gt", "git"),
  t("delivery", "github", "GitHub", "Gh", "github"),
  t("delivery", "bitbucket", "Bitbucket", "Bb", "bitbucket"),

  // Tools and AI
  t("tools", "jira", "Jira", "Ji", "jira"),
  t("tools", "confluence", "Confluence", "Cf", "confluence"),
  t("tools", "figma", "Figma", "Fg", "figma"),
  t("tools", "swagger", "Swagger", "Sw", "swagger"),
  t("tools", "vscode", "VS Code", "Vc", "vscode"),
  t("tools", "visualstudio", "Visual Studio", "Vs", "visualstudio"),
  t("tools", "intellij", "IntelliJ IDEA", "Ij", "intellij"),
  t("tools", "webstorm", "WebStorm", "Ws", "webstorm"),
  t("tools", "copilot", "GitHub Copilot", "Cp", "githubcopilot"),
  t("tools", "gemini", "Google Gemini", "Gm", "googlegemini"),
  t("tools", "claudecode", "Claude Code", "Cl", "claudecode"),
  t("tools", "cursor", "Cursor", "Cu", "cursor"),
];

/** Published path of a technology's icon. */
export function techIconPath(icon: string): string {
  return `/tech/${icon}.svg`;
}
