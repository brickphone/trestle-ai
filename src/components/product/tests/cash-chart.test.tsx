import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { forecast } from "@/lib/forecast";
import { CashChart, chartSeries, chartDomain } from "../cash-chart";
import { demo } from "./fixtures";

describe("cash chart source fidelity", () => {
  it("reconciles all 13 weekly closes and the actual lowest daily balance", () => {
    const result = forecast(demo, "2026-11-02");
    const points = chartSeries(result);
    expect(points).toHaveLength(92);
    for (const week of result.weeks) {
      expect(points[(week.index + 1) * 7]?.cents).toBe(week.closingCents);
    }
    expect(Math.min(...points.map((p) => p.cents))).toBe(result.lowest.minimumCents);
    expect(points.find((p) => p.cents === result.lowest.minimumCents)?.date).toBe(
      result.lowest.minimumDay,
    );
  });
  it("provides an estimate description, a data toggle and source links", () => {
    const html = renderToStaticMarkup(<CashChart result={forecast(demo, "2026-11-02")} />);
    expect(html).toContain('aria-label="Interactive cash projection"');
    expect(html).toContain("Estimate. Lowest projected");
    expect(html).toContain("Show chart data");

    expect(html).toContain("/forecast#week-12-sources");
    expect(html).not.toContain("NaN");
  });
  it("fits positive data rather than forcing zero, and includes zero only when near or crossing", () => {
    expect(chartDomain([8500000, 10000000]).showZero).toBe(false);
    expect(chartDomain([1000000, 10000000]).showZero).toBe(true);
    expect(chartDomain([-1000000, 10000000]).showZero).toBe(true);
    expect(chartDomain([8500000, 10000000]).min).toBeGreaterThan(0);
  });
  it("uses a realistic isolated demo with three jobs, twelve invoices and a visible cash dip", () => {
    expect(demo.jobs).toHaveLength(3);
    expect(demo.invoices).toHaveLength(12);
    expect(new Set(demo.invoices.map((i) => i.status))).toEqual(
      new Set(["paid", "accepted", "submitted", "rejected", "draft"]),
    );
    expect(forecast(demo, "2026-11-02").lowest.minimumCents).toBeLessThan(
      demo.balances[0]!.amount_cents,
    );
  });
  it("shades below zero only for a negative projection", () => {
    const result = forecast(
      { ...demo, balances: [{ ...demo.balances[0]!, amount_cents: 1000000 }] },
      "2026-11-02",
    );
    const html = renderToStaticMarkup(<CashChart result={result} />);
    expect(html).toContain("data-zero-line");
    expect(html).toContain("data-below-zero");
  });
  it("does not plot invented company cash when the opening balance is missing", () => {
    const html = renderToStaticMarkup(
      <CashChart result={forecast({ ...demo, balances: [] }, "2026-11-02")} />,
    );
    expect(html).toContain("Enter an opening balance");
    expect(html).not.toContain("<svg");
  });
  it("keeps a flat, zero-valued forecast finite", () => {
    const result = forecast(
      {
        ...demo,
        jobs: [],
        invoices: [],
        payments: [],
        costs: [],
        balances: [{ ...demo.balances[0]!, amount_cents: 0 }],
      },
      "2026-11-02",
    );
    const html = renderToStaticMarkup(<CashChart result={result} />);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("Low $0");
  });
});
