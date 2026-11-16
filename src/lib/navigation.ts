export interface NavItem {
  label: string;
  href: string;
}

/**
 * Primary navigation. Labels say plainly what each section holds: the 3D
 * flight is a way of telling the career story, so it is called the career
 * journey, not by an aviation term a visitor would have to decode.
 */
export const primaryNav: readonly NavItem[] = [
  { label: "Home", href: "#top" },
  { label: "Career Journey", href: "#chapter-01" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#experience" },
  { label: "Education", href: "#education" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];
