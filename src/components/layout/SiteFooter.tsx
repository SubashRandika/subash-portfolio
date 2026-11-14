interface SiteFooterProps {
  name: string;
}

export function SiteFooter({ name }: SiteFooterProps) {
  return (
    <footer data-theme="dusk" className="border-t border-line">
      <div className="shell flex flex-wrap items-center justify-between gap-x-8 gap-y-2 py-6">
        <p className="type-label text-ink-muted">
          SR-01 <span aria-hidden="true">/</span> Career Flight <span aria-hidden="true">·</span> © {name}
        </p>
        <a href="#top" className="type-label py-3 text-ink-muted no-underline hover:text-ink">
          Back to top
        </a>
      </div>
    </footer>
  );
}
