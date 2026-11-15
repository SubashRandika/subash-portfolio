import { contactLinks } from "@/components/portfolio/Contact";
import type { Profile } from "@/types/portfolio";

interface SiteFooterProps {
  name: string;
  /** Validated contact details; only those supplied are shown. */
  links: Profile["links"];
}

export function SiteFooter({ name, links }: SiteFooterProps) {
  const contact = contactLinks(links);

  return (
    <footer data-theme="dusk" className="border-t border-line">
      <div className="shell flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-6">
        <p className="type-label text-ink-muted">
          SR-01 <span aria-hidden="true">/</span> Career Flight <span aria-hidden="true">·</span> © {name}
        </p>
        {contact.length > 0 ? (
          <nav aria-label="Contact and profiles">
            <ul className="flex flex-wrap gap-x-6">
              {contact.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    className="type-label inline-block py-3 text-ink-muted no-underline hover:text-ink"
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    {...(link.download ? { download: true } : {})}
                  >
                    {link.label}
                    {link.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <a href="#top" className="type-label py-3 text-ink-muted no-underline hover:text-ink">
          Back to top
        </a>
      </div>
    </footer>
  );
}
