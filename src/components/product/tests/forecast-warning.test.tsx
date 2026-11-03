import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actions", () => ({ viewDemo: vi.fn() }));
import { OverviewContent } from "../overview-content";
import { demo, projectedDemo } from "./fixtures";
describe("overview forecast coverage warnings and formatting", () => {
  it("shows prominent links for missing income and a missing opening balance", () => {
    const markup = renderToStaticMarkup(
      <OverviewContent
        data={{
          ...demo,
          jobs: [{ ...demo.jobs[0]!, end_date: null }],
          invoices: [],
          payments: [],
          assumptions: [],
          balances: [],
        }}
      />,
    );
    expect(markup).toContain(
      "Your forecast has no incoming payments. Add invoices or check your jobs’ billing details.",
    );
    expect(markup).toContain('href="/jobs"');
    expect(markup).toContain("Opening balance missing.");
    expect(markup).toContain('href="/settings#balances"');
  });
  it("shows whole-dollar Money out rows while keeping projected sources traceable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    try {
      const markup = renderToStaticMarkup(<OverviewContent data={projectedDemo} />);
      const out = markup.split('id="money-out-sources"')[1]!.split("</ul>")[0]!;
      expect(out).toContain("Projected job costs");
      expect(out).not.toMatch(/<span class="text-fg-subtle">\.\d{2}<\/span>/);
      expect(markup).not.toContain("Your forecast has no incoming payments.");
    } finally {
      vi.useRealTimers();
    }
  });
});
