import { describe, expect, it } from "vitest";
import { calculateCashGap, type CashGapInput } from ".";

const reference: CashGapInput = {
  contractValueCents: 100_000_000,
  durationMonths: 10,
  costRatio: 0.85,
  paymentLagDays: 45,
  retainageRatio: 0.05,
  retainageReleaseDays: 60,
  costProfile: "even",
};

describe("cash-gap scenarios", () => {
  it("matches the hand-calculated $1M / 10-month reference", () => {
    // Every 30-day month: bill $100k, pay $85k, withhold $5k.
    // Progress payments: $95k on days 75,105,...,345.
    // Day 30 balance -$85k; day 60 -$170k; day 75 -$75k.
    // Subsequent cost-day balances improve by $10k per month.
    // Month-end balances in $k, including the payment/release tail:
    // -85,-170,-160,-150,-140,-130,-120,-110,-100,-90,5,150.
    // All $50k retainage arrives day 360 (explicit scenario assumption).
    const result = calculateCashGap(reference);
    expect(result.months.map((m) => m.cumulativeCashCents / 100_000)).toEqual([
      -85, -170, -160, -150, -140, -130, -120, -110, -100, -90, 5, 150,
    ]);
    expect(result.months.slice(0, 10).map((m) => m.costsCents)).toEqual(Array(10).fill(8_500_000));
    expect(result.months.slice(0, 10).map((m) => m.billingsCents)).toEqual(
      Array(10).fill(10_000_000),
    );
    expect(result.timeline.find((e) => e.day === 75)?.progressReceiptsCents).toBe(9_500_000);
    expect(result.timeline.find((e) => e.day === 360)?.retainageReceiptsCents).toBe(5_000_000);
    expect(result.peakGapCents).toBe(17_000_000);
    expect(result.peakGapDay).toBe(60);
    expect(result.totalCostsCents).toBe(85_000_000);
    expect(result.totalRetainageCents).toBe(5_000_000);
    expect(result.finalCashCents).toBe(15_000_000);
  });

  it("front-loads costs using descending weights while keeping billing and total costs fixed", () => {
    const result = calculateCashGap({ ...reference, costProfile: "front-loaded" });
    // Weight sum = 55. Day 120: costs = $850k * 34/55, receipts = $190k.
    expect(result.peakGapCents).toBe(33_545_455);
    expect(result.peakGapDay).toBe(120);
    expect(result.months[0]?.costsCents).toBe(15_454_545);
    expect(result.months[9]?.costsCents).toBe(1_545_455);
    expect(result.totalCostsCents).toBe(85_000_000);
    expect(result.finalCashCents).toBe(15_000_000);
    expect(result.months.map((m) => m.billingsCents)).toEqual(
      calculateCashGap(reference).months.map((m) => m.billingsCents),
    );
  });

  it("nets same-day payments and costs and handles zero lag and no retainage", () => {
    const result = calculateCashGap({ ...reference, paymentLagDays: 0, retainageRatio: 0 });
    expect(result.peakGapCents).toBe(0);
    expect(result.peakGapDay).toBeNull();
    expect(result.months).toHaveLength(10);
    expect(result.finalCashCents).toBe(15_000_000);
  });

  it("tracks peak deficits between month ends, including a loss-making job", () => {
    const result = calculateCashGap({
      ...reference,
      durationMonths: 1,
      costRatio: 1.1,
      paymentLagDays: 1,
      retainageReleaseDays: 0,
    });
    expect(result.peakGapCents).toBe(105_000_000);
    expect(result.peakGapDay).toBe(30);
    expect(result.finalCashCents).toBe(-10_000_000);
  });

  it("conserves odd cents with complete retainage and a long release tail", () => {
    const result = calculateCashGap({
      ...reference,
      contractValueCents: 101,
      durationMonths: 3,
      retainageRatio: 1,
      retainageReleaseDays: 91,
    });
    expect(result.timeline.reduce((s, e) => s + e.billingsCents, 0)).toBe(101);
    expect(result.timeline.reduce((s, e) => s + e.costsCents, 0)).toBe(86);
    expect(result.timeline.reduce((s, e) => s + e.retainageReceiptsCents, 0)).toBe(101);
    expect(result.finalCashCents).toBe(15);
    expect(result.months.at(-1)?.cumulativeCashCents).toBe(15);
    expect(result.timeline.at(-1)?.day).toBe(181);
  });

  it("accepts a zero-value contract without inventing a deficit", () => {
    const input = Object.freeze({ ...reference, contractValueCents: 0 });
    const result = calculateCashGap(input);
    expect(result.finalCashCents).toBe(0);
    expect(result.peakGapCents).toBe(0);
    expect(calculateCashGap(input)).toEqual(result);
  });

  it.each([
    { durationMonths: 0 },
    { durationMonths: 1.5 },
    { contractValueCents: -1 },
    { contractValueCents: Number.MAX_SAFE_INTEGER },
    { costRatio: NaN },
    { costRatio: -0.1 },
    { retainageRatio: 1.1 },
    { paymentLagDays: -1 },
    { paymentLagDays: Infinity },
    { retainageReleaseDays: -1 },
    { retainageReleaseDays: undefined },
    { costProfile: "unknown" },
  ])("rejects invalid assumptions: %j", (override) => {
    expect(() => calculateCashGap({ ...reference, ...override } as CashGapInput)).toThrow(
      RangeError,
    );
  });
});
