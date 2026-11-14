import type { ReactNode } from "react";

interface DocSectionProps {
  id: string;
  /** Section heading, rendered as an h2. */
  title: string;
  /** One line under the heading that says what the section holds. */
  note?: string;
  /** Stacks the heading above the content so wide content gets the full width. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * A portfolio section laid out like a page of a technical document: the
 * heading sits in the margin column and stays in view while its content
 * scrolls past on wide screens.
 */
export function DocSection({ id, title, note, wide = false, children }: DocSectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="doc-section"
      data-wide={wide ? "" : undefined}
    >
      <div className="doc-section-heading">
        <h2 id={headingId} className="type-display-md">
          {title}
        </h2>
        {note ? <p className="type-small mt-3 max-w-[22rem] text-ink-muted">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
