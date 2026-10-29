import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks, type NavItem } from "./nav-links";

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/prospects", label: "Prospects", icon: "list" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/calculator", label: "Cash-gap calculator", icon: "calculator" },
  { href: "/runs", label: "Data runs", icon: "runs" },
];

/**
 * Left-nav application frame. `footer` is the slot for the signed-in user and
 * sign-out control (added with auth).
 */
export function AppShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
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
              T
            </span>
            <span className="text-base font-semibold text-fg">Trestle</span>
            <span className="text-sm text-fg-subtle">GovCon</span>
          </Link>
        </div>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto p-2">
          <NavLinks items={NAV_ITEMS} />
        </nav>
        {footer ? <div className="border-t border-border p-2">{footer}</div> : null}
      </aside>
      <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col focus:outline-none">
        {children}
      </main>
    </div>
  );
}
