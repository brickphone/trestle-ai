import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "border-border bg-surface-muted text-fg-muted",
  accent: "border-accent/20 bg-accent-subtle text-accent-strong",
  success: "border-success/25 bg-success-subtle text-success-strong",
  warning: "border-warning/25 bg-warning-subtle text-warning-strong",
  danger: "border-danger/25 bg-danger-subtle text-danger-strong",
};

const solidTones: Record<BadgeTone, string> = {
  neutral: "border-fg-muted bg-fg-muted text-fg-inverse",
  accent: "border-accent bg-accent text-fg-inverse",
  success: "border-success bg-success text-fg-inverse",
  warning: "border-warning bg-warning text-fg-inverse",
  danger: "border-danger bg-danger text-fg-inverse",
};

/**
 * Compact status label. Meaning is always carried by the text, never by color
 * alone (WCAG 1.4.1). Use `solid` sparingly, e.g. for the exclusion flag.
 */
export function Badge({
  tone = "neutral",
  solid = false,
  className,
  children,
  title,
}: {
  tone?: BadgeTone;
  solid?: boolean;
  className?: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap",
        solid ? solidTones[tone] : tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Marks figures derived from incomplete sources (e.g. subaward data). */
export function PartialDataBadge() {
  return (
    <Badge
      tone="warning"
      title="Derived from subaward data, which is self-reported and incomplete."
    >
      Partial data
    </Badge>
  );
}

/** Marks modeled values (cash-gap) so they are never mistaken for source data. */
export function EstimateBadge() {
  return (
    <Badge tone="neutral" title="Modeled from contract data and the stated assumptions.">
      Estimate
    </Badge>
  );
}
