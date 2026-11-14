type ClassPart = string | false | null | undefined;

/** Joins class names, skipping falsy parts. */
export function cn(...parts: ClassPart[]): string {
  return parts.filter(Boolean).join(" ");
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats an ISO date (YYYY-MM-DD) as "17 Jun 2013".
 * Deliberately avoids `Intl`/`toLocaleDateString` so server and client output
 * can never differ by locale or time zone.
 */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`Expected an ISO date (YYYY-MM-DD), received "${iso}".`);
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) throw new Error(`Invalid month in date "${iso}".`);
  return `${Number(day)} ${monthName} ${year}`;
}

/** Zero-pads a chapter or step number to two digits. */
export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
