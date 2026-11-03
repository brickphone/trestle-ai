import { describe, it, expect } from "vitest";
import { projectRemainingWork, remainingPeriods } from "./remaining";
const base = {
  valueCents: 10000,
  start: "2026-01-01",
  end: "2026-02-28",
  costRatio: 1,
  paymentLagDays: 30,
  retainageRatio: 0,
  costProfile: "front-loaded" as const,
  covered: [],
};
describe("calendar attachment of cash-gap budgets", () => {
  it("keeps exact cents and descending cost weights while paying weekly", () => {
    const result = projectRemainingWork(base);
    expect(
      result.costs
        .filter((c) => c.date.startsWith("2026-01"))
        .reduce((s, c) => s + c.amountCents, 0),
    ).toBe(6667);
    expect(
      result.costs
        .filter((c) => c.date.startsWith("2026-02"))
        .reduce((s, c) => s + c.amountCents, 0),
    ).toBe(3333);
    expect(result.costs.slice(0, 5).map((c) => c.date)).toEqual([
      "2026-01-07",
      "2026-01-14",
      "2026-01-21",
      "2026-01-28",
      "2026-01-31",
    ]);
    expect(result.billings.map((b) => b.date)).toEqual(["2026-03-02", "2026-03-30"]);
  });
  it("suppresses every overlapped invoice period, including partial-month invoices", () => {
    const result = projectRemainingWork({
      ...base,
      end: "2026-03-31",
      covered: [{ start: "2026-01-15", end: "2026-02-15" }],
    });
    expect(result.billings).toHaveLength(1);
    expect(result.billings[0]?.period).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(result.billings[0]?.grossCents).toBe(10000);
  });
  it("clips partial periods and handles leap years without adding a billing past completion", () => {
    expect(remainingPeriods("2028-02-15", "2028-03-10")).toEqual([
      { start: "2028-02-15", end: "2028-02-29" },
      { start: "2028-03-01", end: "2028-03-10" },
    ]);
    expect(remainingPeriods("2026-03-01", "2026-02-28")).toEqual([]);
  });
});
