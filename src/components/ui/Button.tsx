import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "quiet";

interface SharedProps {
  variant?: ButtonVariant;
  /** Decorative icon shown after the label. */
  icon?: IconName;
  children: ReactNode;
}

function buttonClass(variant: ButtonVariant, className?: string): string {
  return cn("btn", `btn-${variant}`, className);
}

function Content({ icon, children }: Pick<SharedProps, "icon" | "children">) {
  return (
    <>
      <span>{children}</span>
      {icon ? <Icon name={icon} size={16} /> : null}
    </>
  );
}

type ButtonProps = SharedProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** An action that happens on this page. */
export function Button({
  variant = "primary",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...props}>
      <Content icon={icon}>{children}</Content>
    </button>
  );
}

type ButtonLinkProps = SharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    /** Opens in a new tab with safe `rel` values and an announced hint. */
    external?: boolean;
  };

/** Navigation that looks like a button: in-page anchors, downloads, links out. */
export function ButtonLink({
  variant = "primary",
  icon,
  className,
  children,
  external = false,
  ...props
}: ButtonLinkProps) {
  const externalProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <a className={buttonClass(variant, className)} {...externalProps} {...props}>
      <Content icon={icon}>{children}</Content>
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  );
}
