import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const base =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded border font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "border-accent bg-accent text-fg-inverse hover:border-accent-hover hover:bg-accent-hover",
  secondary: "border-border-input bg-surface text-fg hover:bg-surface-hover",
  ghost: "border-transparent bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg",
  danger:
    "border-danger bg-danger text-fg-inverse hover:border-danger-strong hover:bg-danger-strong",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2 text-sm",
  md: "h-8 px-3 text-base",
};

export function buttonClasses(variant: Variant = "secondary", size: Size = "md") {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={cn(buttonClasses(variant, size), className)} {...rest} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(buttonClasses(variant, size), className)} {...rest} />;
}
