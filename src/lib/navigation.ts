export interface NavItem {
  label: string;
  href: string;
}

/**
 * Primary navigation. Labels say plainly what each section holds: the 3D
 * flight is a way of telling the career story, so it is called the career
 * journey, not by an aviation term a visitor would have to decode. It is
 * not in the menu: "Begin the journey" in the opening, right below it, goes
 * to the same place, and the menu stays uncluttered.
 */
export const primaryNav: readonly NavItem[] = [
  { label: "Home", href: "#top" },
  { label: "Projects", href: "#projects" },
  { label: "Experience", href: "#experience" },
  { label: "Recommendations", href: "#recommendations" },
  { label: "Education", href: "#education" },
  { label: "About", href: "#about" },
  { label: "Contact", href: "#contact" },
];
