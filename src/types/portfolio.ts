import type { ChapterNumber, ProgressRange } from "@/flight/timeline";

/**
 * Content types for the portfolio.
 *
 * Rule for every field below: a value is either a fact supplied by Subash or
 * `null`. `null` means "not yet provided" and the UI must omit it rather than
 * substitute a placeholder.
 */

export interface Milestone {
  id: string;
  title: string;
  /**
   * One sentence, only when the brief says more than the title does. Stays
   * within what the brief states.
   */
  summary?: string;
  /** Optional supporting facts, shown when the card is opened. */
  points?: readonly string[];
  /** Client or product the milestone belongs to, when a chapter has several. */
  group?: string;
}

export interface Chapter {
  number: ChapterNumber;
  /** Anchor id, e.g. "chapter-03". */
  id: string;
  title: string;
  /** Short period for headings, e.g. "2017–2021". */
  period: string;
  /**
   * Organisations exactly as given in the brief, e.g. "Creative Software / Qmatic AB".
   * Shown verbatim so employer and client are never merged or reordered.
   */
  organisation: string;
  /** Named product or programme, when the brief gives one. */
  product: string | null;
  /** HUD destination readout. */
  destination: string;
  /** Short description of the landscape the jet flies through. */
  environment: string;
  narrative: string;
  /**
   * Areas of work in this chapter, each restating the brief. Labelled
   * "Focus" on the page, not "technologies", so nothing implies a stack the
   * brief does not state.
   */
  focus: readonly string[];
  range: ProgressRange;
  milestones: readonly Milestone[];
}

export interface Engagement {
  /** Client or product organisation the work was delivered for. */
  client: string;
  product?: string;
  /** Role on this engagement when it differs from the employment role. */
  role?: string;
}

export interface ExperienceEntry {
  id: string;
  /** ISO date (YYYY-MM-DD), or a year (YYYY) where only the year is known. */
  start: string;
  /** As `start`, or `null` when the employment is current. */
  end: string | null;
  role: string;
  /** The employing company, or `null` where it has not been named. */
  employer: string | null;
  /** Client and product engagements delivered during this employment. */
  engagements: readonly Engagement[];
  highlights: readonly string[];
  /** Flight chapters that tell this period's story. */
  chapters: readonly ChapterNumber[];
}

export interface Project {
  id: string;
  name: string;
  /** Who the work was for, with the employer named separately. */
  client: string;
  via: string | null;
  summary: string;
  contributions: readonly string[];
  chapter: ChapterNumber;
}

/** A personal, open-source project pinned on GitHub, with a live demo. */
export interface OpenSourceProject {
  /** Repository name, also used for ids and the screenshot file. */
  repo: string;
  name: string;
  /** Repository description, lightly edited for the page. */
  summary: string;
  /** Live demo (the repository's website). */
  demo: string;
  /** Repository on GitHub. */
  source: string;
  /** Year the repository was created. */
  year: number;
  /** Main libraries, from the repository's package.json. */
  stack: readonly string[];
  /** Alt text for the screenshot of the live demo. */
  shot: string;
  /** Brand colour of the demo, used for the card's glow. */
  accent: string;
}

/** A recommendation received on LinkedIn, quoted word for word. */
export interface Recommendation {
  id: string;
  name: string;
  /** The recommender's role, from their LinkedIn headline. */
  headline: string;
  /** LinkedIn's line, such as "Managed Subash directly". */
  relationship: string;
  /** ISO date the recommendation was given. */
  date: string;
  /** One sentence from the text, shown large. */
  excerpt: string;
  /** The full recommendation, one entry per paragraph. */
  text: readonly string[];
}

export interface SkillGroup {
  id: string;
  title: string;
  skills: readonly string[];
}

export interface EducationEntry {
  institution: string;
  qualification: string;
  period: string | null;
}

export interface Profile {
  name: string;
  title: string;
  yearsOfExperience: string;
  careerStartYear: number;
  tagline: readonly [string, string];
  closingMessage: readonly [string, string];
  summary: readonly string[];
  links: {
    linkedin: string | null;
    github: string | null;
    email: string | null;
    /** Site-relative path of the résumé PDF. */
    resume: string | null;
  };
  education: readonly EducationEntry[];
}
