export interface NavItem {
  label: string;
  href: string;
}

/** Primary navigation, in the order given by the brief. */
export const primaryNav: readonly NavItem[] = [
  { label: "Home", href: "#top" },
  { label: "Flight Experience", href: "#chapter-01" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#experience" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];
