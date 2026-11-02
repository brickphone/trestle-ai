import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/config";
import type { ReactNode } from "react";
import { NavLinks, type NavItem } from "./nav-links";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/jobs", label: "Jobs", icon: "list" },
  { href: "/invoices", label: "Government invoices", icon: "runs" },
  { href: "/forecast", label: "13-week forecast", icon: "calculator" },
  { href: "/settings", label: "Settings", icon: "pipeline" },
];

export const INTERNAL_NAV_ITEMS: NavItem[] = [
  { href: "/internal/prospects", label: "Prospects", icon: "list" },
  { href: "/internal/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/internal/runs", label: "Data runs", icon: "runs" },
];

/**
 * Left-nav application frame. `footer` is the slot for the signed-in user and
 * sign-out control (added with auth).
 */
export function AppShell({
  children,
  footer,
  isStaff = false,
  demo = false,
  organizationName,
}: {
  children: ReactNode;
  footer?: ReactNode;
  isStaff?: boolean;
  demo?: boolean;
  organizationName?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <a
        href="#main"
        className="sr-only z-50 rounded bg-accent px-3 py-2 text-fg-inverse focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface md:sticky md:top-0 md:h-dvh md:w-nav md:border-r md:border-b-0">
        <div className="flex h-12 items-center border-b border-border px-4">
          <Link href="/" className="flex items-center gap-2 rounded-sm">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-sm bg-accent text-xs font-semibold text-fg-inverse"
            >
              {PRODUCT_NAME[0]}
            </span>
            <span className="text-base font-semibold text-fg">{PRODUCT_NAME}</span>
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
          <NavLinks items={NAV_ITEMS} />
          {isStaff && (
            <div className="mt-4 border-t border-border pt-2">
              <p className="px-2 py-1 text-xs font-semibold text-fg-subtle">Internal</p>
              <NavLinks
                items={[
                  { href: "/internal", label: "Internal overview", icon: "overview" },
                  ...INTERNAL_NAV_ITEMS,
                ]}
              />
            </div>
          )}
        </nav>
        {footer ? <div className="border-t border-border p-2">{footer}</div> : null}
      </aside>
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        {demo && (
          <div
            role="status"
            className="border-b border-warning bg-warning-subtle px-6 py-2 font-medium text-warning-strong"
          >
            Demo, fictional data · Read-only
          </div>
        )}
        {organizationName && (
          <p className="border-b border-border px-6 py-2 text-sm text-fg-muted">
            {organizationName}
            {isStaff ? " · Staff read-only access" : ""}
          </p>
        )}
        {children}
      </main>
    </div>
  );
}
