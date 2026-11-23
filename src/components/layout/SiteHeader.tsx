"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Icon } from "@/components/ui/Icon";
import { primaryNav } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  name: string;
}

/**
 * Fixed site header. Wide screens show the navigation inline; narrow screens
 * show a menu button that discloses the same links.
 */
export function SiteHeader({ name }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    // The inline navigation replaces the menu on wide screens.
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header
      data-theme="night"
      className="fixed inset-x-0 top-0 z-50 bg-night-900/90 backdrop-blur-md"
      style={{ borderBottom: "1px solid var(--line)" }}
    >
      <div className="shell flex h-(--header-height) items-center justify-between gap-6">
        <a
          href="#top"
          className="font-display text-[0.8125rem] tracking-[0.08em] whitespace-nowrap uppercase no-underline"
          onClick={() => setOpen(false)}
        >
          {name}
        </a>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-5 xl:gap-7">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="type-label py-3 text-ink-muted no-underline transition-colors hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2 lg:-ml-2">
          <ThemeToggle />
          <button
            ref={toggleRef}
            type="button"
            className="-mr-2 inline-flex size-11 items-center justify-center lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} size={22} />
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      <nav
        id={menuId}
        aria-label="Primary"
        hidden={!open}
        className={cn("lg:hidden", open && "border-t border-line bg-night-900")}
      >
        <ul className="shell py-3">
          {primaryNav.map((item) => (
            <li key={item.href} className="border-b border-line last:border-b-0">
              <a
                href={item.href}
                className="type-label flex min-h-12 items-center justify-between no-underline"
                onClick={() => setOpen(false)}
              >
                {item.label}
                <Icon name="arrow-right" size={16} className="text-ink-muted" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
