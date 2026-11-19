"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { RESUME_FILE_NAME } from "@/lib/contact";
import type { ResumeFile } from "@/lib/resume";

/** How long the "sent" state shows before the card resets. */
const SENT_MS = 2600;

const LINES = [0.82, 0.64, 0.74, 0.5];

/**
 * The résumé as a small two-page document. Hover or focus fans the pages
 * and writes the lines in; a click files the top page into the tray and the
 * arrow becomes a tick. It is a plain link, so it works without JavaScript.
 */
export function ResumeDownload({ file }: { file: ResumeFile }) {
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!sent) return;
    const timer = window.setTimeout(() => setSent(false), SENT_MS);
    return () => window.clearTimeout(timer);
  }, [sent]);

  const facts = [
    "PDF",
    file.pages ? `${file.pages} ${file.pages === 1 ? "page" : "pages"}` : null,
    file.size,
  ].filter((fact): fact is string => fact !== null);

  // Starts with the visible label, then the facts the eye reads as one line.
  const label = `Download résumé, ${facts.join(", ")}${file.external ? " (opens in a new tab)" : ""}`;

  const linkProps = file.external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : { download: RESUME_FILE_NAME };

  return (
    <>
      <a
        className="resume-card"
        href={file.href}
        aria-label={label}
        data-state={sent ? "sent" : undefined}
        onClick={() => setSent(true)}
        {...linkProps}
      >
        <span className="resume-doc" aria-hidden="true">
          <span className="resume-page resume-page-back" />
          <span className="resume-page resume-page-front">
            {LINES.map((width, index) => (
              <span
                key={index}
                className="resume-line"
                style={{ "--w": width, "--i": index } as CSSProperties}
              />
            ))}
          </span>
          <span className="resume-tray" />
        </span>

        <span className="resume-text">
          <span className="resume-label">Download résumé</span>
          <span className="resume-meta">
            <span className="resume-facts">{facts.join(" · ")}</span>
            <span className="resume-sent" aria-hidden="true">
              {file.external ? "Opened in a new tab" : "Download started"}
            </span>
          </span>
        </span>

        <span className="resume-action" aria-hidden="true">
          <Icon name="download" size={18} className="resume-arrow" />
          <Icon name="check" size={18} className="resume-check" />
        </span>
      </a>
      <span className="sr-only" aria-live="polite">
        {sent && !file.external ? "Résumé download started." : ""}
      </span>
    </>
  );
}
