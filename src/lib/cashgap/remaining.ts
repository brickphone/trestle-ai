import { calculateCashGap } from ".";
import { addDays, daysBetween, isoDate } from "../finance";

export type BillingPeriod = { start: string; end: string };
/** Calendar month periods, clipped to the remaining performance window. */
export function remainingPeriods(start: string, end: string): BillingPeriod[] {
  isoDate.parse(start);
  isoDate.parse(end);
  if (end < start) return [];
  const result: BillingPeriod[] = [];
  let date = start;
  while (date <= end) {
    if (result.length >= 1200) throw new RangeError("Projection cannot exceed 1200 months");
    const d = new Date(`${date}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10);
    const last = monthEnd < end ? monthEnd : end;
    result.push({ start: date, end: last });
    date = addDays(last, 1);
  }
  return result;
}
/**
 * Use cash-gap allocation/rounding for the remaining budget, then attach calendar dates.
 * Bill at each uncovered month's end. Pay job costs weekly, plus a month-end stub,
 * prorating that month's exact cost budget across its days (no cents lost).
 * A covered period gets no projected invoice. The remaining unbilled value is divided
 * among uncovered periods, never added to the real invoice's period.
 */
export function projectRemainingWork(input: {
  valueCents: number;
  start: string;
  end: string;
  costRatio: number;
  paymentLagDays: number;
  retainageRatio: number;
  costProfile: "even" | "front-loaded";
  covered: BillingPeriod[];
}) {
  const periods = remainingPeriods(input.start, input.end);
  if (!periods.length) return { billings: [], costs: [], periods };
  const open = periods.filter(
    (p) => !input.covered.some((i) => i.start <= p.end && i.end >= p.start),
  );
  const plan = calculateCashGap({
    contractValueCents: input.valueCents,
    durationMonths: periods.length,
    costRatio: input.costRatio,
    paymentLagDays: input.paymentLagDays,
    retainageRatio: input.retainageRatio,
    retainageReleaseDays: 0,
    costProfile: input.costProfile,
  });
  const billings = open.length
    ? calculateCashGap({
        contractValueCents: input.valueCents,
        durationMonths: open.length,
        costRatio: 0,
        paymentLagDays: input.paymentLagDays,
        retainageRatio: input.retainageRatio,
        retainageReleaseDays: 0,
        costProfile: "even",
      })
        .timeline.filter((e) => e.billingsCents > 0)
        .map((event, index) => ({
          period: open[index]!,
          date: addDays(open[index]!.end, input.paymentLagDays),
          amountCents: event.billingsCents - event.withheldCents,
          grossCents: event.billingsCents,
          retainedCents: event.withheldCents,
        }))
    : [];
  const monthly = plan.timeline.filter((e) => e.billingsCents > 0 || e.costsCents > 0);
  const costs = periods.flatMap((p, index) => {
    const budget = monthly[index]?.costsCents ?? 0,
      days = daysBetween(p.start, p.end) + 1;
    const rows: { date: string; amountCents: number }[] = [];
    let used = 0;
    for (let elapsed = Math.min(7, days); ; elapsed = Math.min(elapsed + 7, days)) {
      const cumulative = Math.round((budget * elapsed) / days);
      rows.push({ date: addDays(p.start, elapsed - 1), amountCents: cumulative - used });
      used = cumulative;
      if (elapsed === days) break;
    }
    return rows;
  });
  return { billings, costs, periods };
}
