import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Bordered section with a title bar. Used for every block on the firm detail
 * page (score, metrics, contracts, cash gap). `headingLevel` keeps the
 * document outline correct when panels nest.
 */
export function Panel({
  title,
  description,
  actions,
  headingLevel = 2,
  flush = false,
  className,
  children,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
  /** Remove body padding, e.g. when the body is a table. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("flex min-w-0 flex-col rounded-md border border-border bg-surface", className)}
    >
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 flex-col">
          <Heading id={headingId} className="text-md text-fg">
            {title}
          </Heading>
          {description ? <p className="text-sm text-fg-subtle">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </section>
  );
}

export type DescriptionItem = {
  label: ReactNode;
  value: ReactNode;
  /** Right-align and use tabular figures (amounts, counts). */
  numeric?: boolean;
  /** Extra context under the value: source field, assumption, badge. */
  note?: ReactNode;
};

/** Two-column label/value list for detail panels. */
export function DescriptionList({
  items,
  columns = 1,
  className,
}: {
  items: DescriptionItem[];
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-8",
        columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(120px,40%)_1fr] items-baseline gap-3 border-b border-border py-2 last:border-b-0"
        >
          <dt className="text-sm text-fg-muted">{item.label}</dt>
          <dd
            className={cn(
              "flex min-w-0 flex-col gap-0.5 text-base text-fg",
              item.numeric && "items-end text-right tabular",
            )}
          >
            <span className="min-w-0 break-words">{item.value}</span>
            {item.note ? <span className="text-xs text-fg-subtle">{item.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
