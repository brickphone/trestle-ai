import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A single headline figure. `value` should already be formatted (see
 * lib/format). `footnote` is for provenance: source, as-of date, or a
 * "Partial data" / "Estimate" badge.
 */
export function StatCard({
  label,
  value,
  detail,
  footnote,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface px-4 py-3",
        className,
      )}
    >
      <dt className="truncate text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="flex flex-col gap-1">
        <span className="text-2xl font-semibold text-fg tabular">{value}</span>
        {detail ? <span className="text-sm text-fg-muted">{detail}</span> : null}
        {footnote ? (
          <span className="flex items-center gap-2 text-xs text-fg-subtle">{footnote}</span>
        ) : null}
      </dd>
    </div>
  );
}

/** Responsive row of StatCards; renders a <dl> so label/value pairs are semantic. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3", className)}>
      {children}
    </dl>
  );
}
