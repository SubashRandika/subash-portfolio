import { Icon, type IconName } from "@/components/ui/Icon";
import type { Profile } from "@/types/portfolio";
import { RESUME_FILE_NAME } from "@/lib/contact";

interface ContactProps {
  profile: Profile;
  /** Validated contact details (see lib/contact.ts). */
  links: Profile["links"];
}

interface ContactLink {
  id: string;
  label: string;
  /** What the visitor sees as the destination, e.g. the address itself. */
  value: string;
  href: string;
  icon: IconName;
  external: boolean;
  /** File name for the download, when the link is a download. */
  download?: string;
}

/** Builds the list of contact links from the facts that have been supplied. */
export function contactLinks(links: Profile["links"]): ContactLink[] {
  const result: ContactLink[] = [];
  if (links.email) {
    result.push({
      id: "email",
      label: "Email",
      value: links.email,
      href: `mailto:${links.email}`,
      icon: "mail",
      external: false,
    });
  }
  if (links.linkedin) {
    result.push({
      id: "linkedin",
      label: "LinkedIn",
      value: links.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
      href: links.linkedin,
      icon: "linkedin",
      external: true,
    });
  }
  if (links.github) {
    result.push({
      id: "github",
      label: "GitHub",
      value: links.github.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""),
      href: links.github,
      icon: "github",
      external: true,
    });
  }
  if (links.resume) {
    result.push({
      id: "resume",
      label: "Résumé",
      value: "Download PDF",
      href: links.resume,
      icon: "download",
      external: false,
      download: RESUME_FILE_NAME,
    });
  }
  return result;
}

export function Contact({ profile, links: details }: ContactProps) {
  const [closingLead, closingFollow] = profile.closingMessage;
  const links = contactLinks(details);

  return (
    <section id="contact" data-theme="dusk" aria-labelledby="contact-heading" className="section-space">
      <div className="shell">
        <p className="type-label text-ink-muted">Contact</p>
        <h2 id="contact-heading" className="type-display-lg mt-5 max-w-[20ch]">
          {closingLead}
        </h2>
        <p className="type-lead mt-4 text-accent-ink italic">{closingFollow}</p>

        {links.length > 0 ? (
          <ul className="mt-12 grid max-w-4xl border-b border-line sm:grid-cols-2">
            {links.map((link) => (
              <li key={link.id} className="border-t border-line">
                <a
                  href={link.href}
                  className="group flex min-h-16 items-center gap-4 py-4 no-underline"
                  {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  {...(link.download ? { download: link.download } : {})}
                >
                  <Icon name={link.icon} size={22} className="shrink-0 text-ink-muted" />
                  <span className="min-w-0">
                    <span className="type-label block text-ink-muted">{link.label}</span>
                    <span className="block truncate text-link underline decoration-transparent transition-colors group-hover:decoration-current">
                      {link.value}
                    </span>
                  </span>
                  {link.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                </a>
              </li>
            ))}
          </ul>
        ) : process.env.NODE_ENV === "development" ? (
          // A reminder for development only; visitors never see it.
          <p className="type-small mt-10 max-w-xl border border-dashed border-line-strong p-4 text-ink-muted">
            No contact details are configured. Set them in src/data/profile.ts or with the
            NEXT_PUBLIC_CONTACT_* variables described in .env.example.
          </p>
        ) : null}
      </div>
    </section>
  );
}
