import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-subtle">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="rounded-sm hover:text-fg hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "text-fg-muted" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last ? <Icon name="chevronRight" size={12} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Top of every page: breadcrumbs, one h1, optional description, metadata line
 * (e.g. "Last refresh …") and right-aligned actions.
 */
export function PageHeader({
  title,
  breadcrumbs = [],
  description,
  meta,
  actions,
}: {
  title: ReactNode;
  breadcrumbs?: Crumb[];
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 border-b border-border bg-surface px-6 pt-4 pb-4">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl text-fg">{title}</h1>
          {description ? <p className="max-w-3xl text-base text-fg-muted">{description}</p> : null}
          {meta ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-subtle">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

/** Standard page body padding and vertical rhythm. */
export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 p-6">{children}</div>;
}
