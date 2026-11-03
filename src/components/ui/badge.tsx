import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "text-fg-muted",
  accent: "text-accent-strong",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
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
        "inline-flex min-h-5 items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        solid && "font-semibold",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Status({ value }: { value: string }) {
  const tone = ["paid"].includes(value)
    ? "success"
    : ["rejected", "declined", "voided"].includes(value)
      ? "danger"
      : ["pending", "on_hold"].includes(value)
        ? "warning"
        : "neutral";
  return (
    <Badge tone={tone}>
      <span className="capitalize">{value.replaceAll("_", " ")}</span>
    </Badge>
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
