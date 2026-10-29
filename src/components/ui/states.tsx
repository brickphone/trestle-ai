import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { NOT_AVAILABLE } from "@/lib/format";
import { Icon } from "./icon";

/** Inline marker for a field the source did not provide. */
export function NotAvailable({ reason }: { reason?: string }) {
  return (
    <span className="text-fg-subtle italic" title={reason}>
      {NOT_AVAILABLE}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border border-dashed border-border-strong bg-surface px-6 py-8",
        className,
      )}
    >
      <p className="text-md font-semibold text-fg">{title}</p>
      {description ? <div className="max-w-2xl text-base text-fg-muted">{description}</div> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  detail,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  /** Technical detail (error message, digest) shown in a monospace block. */
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-md border border-danger/30 bg-danger-subtle px-4 py-3",
        className,
      )}
    >
      <Icon name="alert" className="mt-0.5 shrink-0 text-danger" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-semibold text-danger-strong">{title}</p>
        {description ? <div className="text-base text-fg">{description}</div> : null}
        {detail ? (
          <pre className="mt-1 overflow-x-auto rounded-sm border border-danger/20 bg-surface px-2 py-1 font-mono text-xs text-fg-muted">
            {detail}
          </pre>
        ) : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warning";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border px-4 py-3",
        tone === "warning"
          ? "border-warning/30 bg-warning-subtle"
          : "border-accent/20 bg-accent-subtle",
        className,
      )}
    >
      <Icon
        name={tone === "warning" ? "alert" : "info"}
        className={cn("mt-0.5 shrink-0", tone === "warning" ? "text-warning" : "text-accent")}
      />
      <div className="flex min-w-0 flex-col gap-1 text-base text-fg">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-surface-hover", className)} />;
}

/** Loading placeholder sized like the content it replaces. Announces once to screen readers. */
export function LoadingState({
  label = "Loading",
  rows = 6,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col gap-2 rounded-md border border-border bg-surface p-4",
        className,
      )}
    >
      <span className="sr-only">{label}…</span>
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}
