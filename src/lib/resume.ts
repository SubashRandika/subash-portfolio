/**
 * Facts about the résumé PDF, read from the file at build time so the page
 * can say how long and how large it is without anyone keeping that in sync.
 *
 * Server-only: it reads public/ from disk.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheLife } from "next/cache";

export interface ResumeFile {
  href: string;
  /** Same-origin files download under RESUME_FILE_NAME (contact.ts); others open in a new tab. */
  external: boolean;
  /** Page count, when the file is local and readable. */
  pages: number | null;
  /** Size such as "99 KB", when the file is local and readable. */
  size: string | null;
}

/** Counts page objects ("/Type /Page", not "/Type /Pages") in a PDF. */
export function countPdfPages(pdf: Buffer): number | null {
  const matches = pdf.toString("latin1").match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches && matches.length > 0 ? matches.length : null;
}

/** 101255 → "99 KB"; 2.4 MB stays in megabytes. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function describeResume(href: string | null, publicDir = join(/*turbopackIgnore: true*/ process.cwd(), "public")): ResumeFile | null {
  if (!href) return null;
  if (!href.startsWith("/")) return { href, external: true, pages: null, size: null };
  try {
    // Read once while the page is prerendered; the server never needs the
    // file at runtime, so it is kept out of output tracing.
    const pdf = readFileSync(/*turbopackIgnore: true*/ join(publicDir, href));
    return { href, external: false, pages: countPdfPages(pdf), size: formatFileSize(pdf.length) };
  } catch {
    return { href, external: false, pages: null, size: null };
  }
}

/**
 * describeResume for the page. With cacheComponents, reading a file while
 * rendering is uncached I/O and fails the prerender; cached, the facts are
 * read once and become part of the static page.
 */
export async function loadResume(href: string | null): Promise<ResumeFile | null> {
  "use cache";
  // The file only changes with a deploy, so the page need not revalidate.
  cacheLife("max");
  return describeResume(href);
}
