/** A deterministic scenario, not a prediction of a contractor's actual cash flow. */
export type CashGapInput = {
  contractValueCents: number;
  durationMonths: number;
  costRatio: number;
  paymentLagDays: number;
  retainageRatio: number;
  /** Actual assumed cash receipt date, measured from completion. Required, with no legal default. */
  retainageReleaseDays: number;
  costProfile: "even" | "front-loaded";
};

export type CashGapPeriod = {
  /** Model day: 30-day months, first invoice and cost payment on day 30. */
  day: number;
  costsCents: number;
  billingsCents: number;
  withheldCents: number;
  progressReceiptsCents: number;
  retainageReceiptsCents: number;
  netCashCents: number;
  cumulativeCashCents: number;
};

function integer(value: number, name: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer between ${min} and ${max}`);
  }
}

function ratio(value: number, name: string, max: number) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new RangeError(`${name} must be between 0 and ${max}`);
  }
}

/** Cumulative rounding preserves the exact total, including odd cents. */
function distribute(total: number, weights: number[]): number[] {
  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  let cumulativeWeight = 0;
  return weights.map((weight) => {
    cumulativeWeight += weight;
    const cumulative = Math.round(total * (cumulativeWeight / denominator));
    const amount = cumulative - used;
    used = cumulative;
    return amount;
  });
}

/**
 * Monthly billing is even. Costs are paid at month end; front-loaded costs use
 * descending weights N..1. Progress cash arrives exactly lag days after billing.
 * Retainage cash arrives at completion + release days, independently of lag.
 * Same-day flows are netted; the peak uses exact event days, not month buckets.
 * No opening cash, financing, taxes, weekends, approval delays or legal defaults.
 */
export function calculateCashGap(input: CashGapInput) {
  integer(input.contractValueCents, "contractValueCents", 0, 1_000_000_000_000);
  integer(input.durationMonths, "durationMonths", 1, 1_200);
  integer(input.paymentLagDays, "paymentLagDays", 0, 36_500);
  integer(input.retainageReleaseDays, "retainageReleaseDays", 0, 36_500);
  ratio(input.costRatio, "costRatio", 10);
  ratio(input.retainageRatio, "retainageRatio", 1);
  if (input.costProfile !== "even" && input.costProfile !== "front-loaded") {
    throw new RangeError("costProfile must be even or front-loaded");
  }

  const weights = Array.from({ length: input.durationMonths }, (_, i) =>
    input.costProfile === "even" ? 1 : input.durationMonths - i,
  );
  const totalCostsCents = Math.round(input.contractValueCents * input.costRatio);
  const costs = distribute(totalCostsCents, weights);
  const billings = distribute(
    input.contractValueCents,
    weights.map(() => 1),
  );
  const events = new Map<number, CashGapPeriod>();
  function at(day: number): CashGapPeriod {
    let event = events.get(day);
    if (!event) {
      event = {
        day,
        costsCents: 0,
        billingsCents: 0,
        withheldCents: 0,
        progressReceiptsCents: 0,
        retainageReceiptsCents: 0,
        netCashCents: 0,
        cumulativeCashCents: 0,
      };
      events.set(day, event);
    }
    return event;
  }

  let totalRetainageCents = 0;
  for (let i = 0; i < input.durationMonths; i++) {
    const day = (i + 1) * 30;
    const billing = billings[i]!; // Arrays are allocated to durationMonths.
    const withheld = Math.round(billing * input.retainageRatio);
    const event = at(day);
    event.costsCents += costs[i]!;
    event.billingsCents += billing;
    event.withheldCents += withheld;
    at(day + input.paymentLagDays).progressReceiptsCents += billing - withheld;
    totalRetainageCents += withheld;
  }
  if (totalRetainageCents > 0) {
    at(input.durationMonths * 30 + input.retainageReleaseDays).retainageReceiptsCents +=
      totalRetainageCents;
  }

  const timeline = [...events.values()].sort((a, b) => a.day - b.day);
  let balance = 0;
  let peakGapCents = 0;
  let peakGapDay: number | null = null;
  for (const event of timeline) {
    event.netCashCents =
      event.progressReceiptsCents + event.retainageReceiptsCents - event.costsCents;
    balance += event.netCashCents;
    event.cumulativeCashCents = balance;
    if (-balance > peakGapCents) {
      peakGapCents = -balance;
      peakGapDay = event.day;
    }
  }

  const months: CashGapPeriod[] = [];
  for (let month = 1; month <= Math.ceil(timeline.at(-1)!.day / 30); month++) {
    const period: CashGapPeriod = {
      day: month * 30,
      costsCents: 0,
      billingsCents: 0,
      withheldCents: 0,
      progressReceiptsCents: 0,
      retainageReceiptsCents: 0,
      netCashCents: 0,
      cumulativeCashCents: months.at(-1)?.cumulativeCashCents ?? 0,
    };
    for (const event of timeline) {
      if (event.day > (month - 1) * 30 && event.day <= month * 30) {
        period.costsCents += event.costsCents;
        period.billingsCents += event.billingsCents;
        period.withheldCents += event.withheldCents;
        period.progressReceiptsCents += event.progressReceiptsCents;
        period.retainageReceiptsCents += event.retainageReceiptsCents;
        period.netCashCents += event.netCashCents;
        period.cumulativeCashCents = event.cumulativeCashCents;
      }
    }
    months.push(period);
  }
  return {
    timeline,
    months,
    totalCostsCents,
    totalRetainageCents,
    peakGapCents,
    peakGapDay,
    finalCashCents: balance,
  };
}
