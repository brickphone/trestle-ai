import Link from "next/link";
import { readableCase } from "@/lib/display-case";
import { PRODUCT_NAME } from "@/lib/config";
import type { ReactNode } from "react";
import { NavLinks, type NavItem } from "./nav-links";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview" },
  { href: "/jobs", label: "Jobs" },
  { href: "/invoices", label: "Government invoices" },
  { href: "/forecast", label: "13-week forecast" },
  { href: "/settings", label: "Settings" },
];

export const INTERNAL_NAV_ITEMS: NavItem[] = [
  { href: "/internal/prospects", label: "Prospects" },
  { href: "/internal/pipeline", label: "Pipeline" },
  { href: "/internal/runs", label: "Data runs" },
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
        <div className="flex h-18 items-center px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 rounded-sm hover:text-fg-muted">
            <span className="text-lg font-semibold tracking-tight">{PRODUCT_NAME}</span>
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2 lg:px-5">
          <NavLinks items={NAV_ITEMS} />
          {isStaff && (
            <div className="mt-4 border-t border-border pt-2">
              <p className="px-2 py-1 text-xs font-semibold text-fg-subtle">Internal</p>
              <NavLinks
                items={[{ href: "/internal", label: "Internal overview" }, ...INTERNAL_NAV_ITEMS]}
              />
            </div>
          )}
        </nav>
        <div className="border-t border-border p-3 lg:p-5">
          {organizationName && (
            <div className="mb-2 flex flex-col gap-1 px-3">
              <span className="text-xs text-fg-subtle">Organization</span>
              <span className="text-sm font-medium break-words">
                {readableCase(organizationName)}
              </span>
              {isStaff && <span className="text-xs text-fg-subtle">Staff read-only access</span>}
            </div>
          )}
          {footer}
        </div>
      </aside>
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        <div className="workspace-content">
          {demo && (
            <div
              role="status"
              className="border-b border-border bg-warning-subtle px-6 py-2 text-xs font-medium text-warning-strong lg:px-8"
            >
              Demo, fictional data · Read-only
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
