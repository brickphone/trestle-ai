import type { FormHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Horizontal strip of labeled filters above a table. Wrap `Field`s from
 * `./form`. Renders as a <form role="search"> so filters can submit via GET
 * (shareable URLs) or be handled client-side via onSubmit/onChange.
 */
export function FilterBar({
  children,
  actions,
  summary,
  className,
  ...rest
}: FormHTMLAttributes<HTMLFormElement> & {
  children: ReactNode;
  /** Right-aligned buttons, e.g. Reset / Apply. */
  actions?: ReactNode;
  /** Result count or active-filter summary, announced politely on change. */
  summary?: ReactNode;
}) {
  return (
    <form
      role="search"
      className={cn(
        "flex flex-col gap-3 rounded-md border border-border bg-surface p-3",
        className,
      )}
      {...rest}
    >
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {actions ? <div className="ml-auto flex items-end gap-2">{actions}</div> : null}
      </div>
      {summary ? (
        <div aria-live="polite" className="text-sm text-fg-subtle">
          {summary}
        </div>
      ) : null}
    </form>
  );
}
