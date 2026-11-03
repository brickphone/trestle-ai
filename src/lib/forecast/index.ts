import type {
  Job,
  Invoice,
  Payment,
  ChangeOrder,
  Balance,
  RecurringCost,
  Assumption,
} from "../data/types";
import { addDays, daysBetween, invoiceDueDate } from "../finance";
import { projectRemainingWork } from "../cashgap/remaining";
import { FORECAST_DEFAULTS } from "../config";
export type ForecastData = {
  jobs: Job[];
  invoices: Invoice[];
  payments: Payment[];
  changes: ChangeOrder[];
  balances: Balance[];
  costs: RecurringCost[];
  assumptions: Assumption[];
};
export type CashSource = {
  id: string;
  date: string;
  amountCents: number;
  label: string;
  href: string;
  estimate: boolean;
  kind: "receipt" | "cost" | "opening";
  projection?: "billing" | "job-cost";
  period?: { start: string; end: string };
  grossCents?: number;
  retainedCents?: number;
};
export type ForecastIssue = { label: string; href: string };
export const active = <T extends { voided_at: Date | null }>(rows: T[]) =>
  rows.filter((r) => !r.voided_at);
export function invoiceTotals(invoice: Invoice, payments: Payment[]) {
  const rows = active(payments).filter((p) => p.invoice_id === invoice.id);
  const paid = rows.filter((p) => p.kind === "progress").reduce((s, p) => s + p.amount_cents, 0);
  const retainagePaid = rows
    .filter((p) => p.kind === "retainage")
    .reduce((s, p) => s + p.amount_cents, 0);
  return {
    paid,
    retainagePaid,
    net: invoice.billed_cents - invoice.retainage_cents,
    remaining: invoice.billed_cents - invoice.retainage_cents - paid,
    retainageHeld: invoice.retainage_cents - retainagePaid,
  };
}
export function effectiveValue(job: Job, changes: ChangeOrder[]) {
  return job.contract_value_cents === null
    ? null
    : job.contract_value_cents +
        active(changes)
          .filter((c) => c.job_id === job.id && c.status === "approved")
          .reduce((s, c) => s + c.amount_cents, 0);
}
export function forecast(data: ForecastData, startDate: string, jobId?: string) {
  const jobs = active(data.jobs).filter((j) => !jobId || j.id === jobId);
  const jobIds = new Set(jobs.map((j) => j.id));
  const invoices = active(data.invoices).filter((i) => jobIds.has(i.job_id));
  const opening = active(data.balances)
    .filter((b) => (b.job_id ?? undefined) === jobId && b.as_of_date === startDate)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];
  const sources: CashSource[] = [];
  const issues: ForecastIssue[] = [];
  const endDate = addDays(startDate, 90);
  if (!opening)
    issues.push({
      label: jobId
        ? "No job opening balance; showing net cash contribution."
        : "Opening balance missing for this forecast date.",
      href: "/settings#balances",
    });
  else
    sources.push({
      id: opening.id,
      date: startDate,
      amountCents: opening.amount_cents,
      label: "Opening balance",
      href: `/settings#balance-${opening.id}`,
      estimate: false,
      kind: "opening",
    });
  for (const p of active(data.payments)) {
    if (!invoices.some((i) => i.id === p.invoice_id)) continue;
    sources.push({
      id: p.id,
      date: p.received_date,
      amountCents: p.amount_cents,
      label: `Recorded ${p.kind} payment`,
      href: `/invoices/${p.invoice_id}#payment-${p.id}`,
      estimate: false,
      kind: "receipt",
    });
  }
  for (const inv of invoices) {
    if (["draft", "rejected"].includes(inv.status)) {
      issues.push({
        label: `${inv.invoice_number}: ${inv.status}; excluded from expected receipts.`,
        href: `/invoices/${inv.id}`,
      });
      continue;
    }
    const totals = invoiceTotals(inv, data.payments);
    const due = invoiceDueDate(inv);
    const expected = inv.expected_payment_date ?? due.date;
    if (totals.remaining > 0) {
      if (!expected || expected < startDate)
        issues.push({
          label: `${inv.invoice_number}: enter a current expected payment date.`,
          href: `/invoices/${inv.id}`,
        });
      else
        sources.push({
          id: inv.id,
          date: expected,
          amountCents: totals.remaining,
          label: `${inv.invoice_number}: remaining net payment`,
          href: `/invoices/${inv.id}`,
          estimate: true,
          kind: "receipt",
        });
    }
    if (totals.retainageHeld > 0) {
      if (!inv.expected_retainage_date || inv.expected_retainage_date < startDate)
        issues.push({
          label: `${inv.invoice_number}: retainage receipt date is missing or past.`,
          href: `/invoices/${inv.id}`,
        });
      else
        sources.push({
          id: `${inv.id}-retainage`,
          date: inv.expected_retainage_date,
          amountCents: totals.retainageHeld,
          label: `${inv.invoice_number}: expected retainage`,
          href: `/invoices/${inv.id}`,
          estimate: true,
          kind: "receipt",
        });
    }
  }
  const costScope = (c: RecurringCost) =>
    c.cost_scope ?? (c.job_id ? "job" : c.category === "payroll" ? "unclassified" : "overhead");
  const allCosts = active(data.costs).filter((c) => !jobId || c.job_id === jobId);
  const modeledJobs = jobs.filter(
    (j) =>
      j.status === "active" &&
      data.assumptions.find((a) => a.job_id === j.id)?.enabled !== false &&
      data.assumptions.find((a) => a.job_id === j.id)?.cost_mode !== "explicit",
  );
  const costs = allCosts.filter((c) => {
    if (costScope(c) === "unclassified" && modeledJobs.length) {
      issues.push({
        label: `${c.label}: classify this cost as office overhead or job costs in Settings. It is excluded while job costs are projected, to prevent double counting.`,
        href: `/settings#cost-${c.id}`,
      });
      return false;
    }
    return true;
  });
  if (costs.length === 0 && modeledJobs.length === 0)
    issues.push({
      label: jobId
        ? "No costs assigned to this job; company costs are not allocated."
        : "No recurring costs entered; payroll and operating costs are excluded.",
      href: "/settings",
    });
  for (const cost of costs) {
    let date = cost.start_date;
    let occurrence = 0;
    while (date <= endDate && (!cost.end_date || date <= cost.end_date)) {
      if (date >= startDate)
        sources.push({
          id: `${cost.id}-${date}`,
          date,
          amountCents: -cost.amount_cents,
          label: cost.label,
          href: `/settings#cost-${cost.id}`,
          estimate: true,
          kind: "cost",
        });
      occurrence++;
      if (cost.frequency === "weekly") date = addDays(cost.start_date, occurrence * 7);
      else {
        const base = new Date(`${cost.start_date}T00:00:00Z`);
        const month = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + occurrence, 1));
        const last = new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
        ).getUTCDate();
        month.setUTCDate(Math.min(base.getUTCDate(), last));
        date = month.toISOString().slice(0, 10);
      }
    }
  }
  for (const job of jobs) {
    if (job.status !== "active") continue;
    const assumption = data.assumptions.find((a) => a.job_id === job.id);
    if (assumption?.enabled === false) {
      issues.push({
        label: `${job.contract_number}: projected billings are disabled.`,
        href: `/jobs/${job.id}#assumptions`,
      });
      continue;
    }
    const value =
      assumption?.value_override_cents ?? job.obligated_cents ?? job.contract_value_cents;
    const approved = active(data.changes)
      .filter((c) => c.job_id === job.id && c.status === "approved")
      .reduce((sum, c) => sum + c.amount_cents, 0);
    const href = `/jobs/${job.id}#assumptions`;
    if (value === null || value === undefined || !job.end_date || job.end_date < startDate) {
      issues.push({
        label: `${job.contract_number}: billing value and a future end date are needed for projected income.`,
        href,
      });
      continue;
    }
    const jobInvoices = invoices.filter((i) => i.job_id === job.id);
    const billedInvoices = jobInvoices.filter((i) => !["draft", "rejected"].includes(i.status));
    const baseline = assumption?.billed_before_tracking_cents ?? 0;
    const baselineDate = assumption?.billed_through_date ?? null;
    const prior = billedInvoices
      .filter((i) => baselineDate && (i.submitted_date ?? i.period_end) <= baselineDate)
      .reduce((s, i) => s + i.billed_cents, 0);
    const after = billedInvoices
      .filter((i) => !baselineDate || (i.submitted_date ?? i.period_end) > baselineDate)
      .reduce((s, i) => s + i.billed_cents, 0);
    const remaining = Math.max(0, value + approved - Math.max(baseline, prior) - after);
    if (!remaining) continue;
    const start = job.start_date && job.start_date > startDate ? job.start_date : startDate;
    let plan: ReturnType<typeof projectRemainingWork>;
    try {
      plan = projectRemainingWork({
        valueCents: remaining,
        start,
        end: job.end_date,
        costRatio: (assumption?.cost_ratio_bps ?? FORECAST_DEFAULTS.costRatioBps) / 10000,
        paymentLagDays: assumption?.payment_lag_days ?? FORECAST_DEFAULTS.paymentLagDays,
        retainageRatio: job.retainage_bps / 10000,
        costProfile: (assumption?.cost_profile ?? FORECAST_DEFAULTS.costProfile) as
          "even" | "front-loaded",
        covered: jobInvoices.map((i) => ({ start: i.period_start, end: i.period_end })),
      });
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      issues.push({
        label: `${job.contract_number}: remaining value or dates exceed the projection limits. Review billing details.`,
        href,
      });
      continue;
    }

    for (const billing of plan.billings)
      if (billing.amountCents > 0)
        sources.push({
          id: `${job.id}-projected-${billing.period.end}`,
          date: billing.date,
          amountCents: billing.amountCents,
          label: `${job.contract_number}: Projected, not invoiced`,
          href,
          estimate: true,
          kind: "receipt",
          projection: "billing",
          period: billing.period,
          grossCents: billing.grossCents,
          retainedCents: billing.retainedCents,
        });
    if (!plan.billings.length)
      issues.push({
        label: `${job.contract_number}: all remaining billing periods have invoices; review their status and expected dates.`,
        href,
      });
    const enteredJobCosts = costs.filter(
      (c) =>
        c.job_id === job.id &&
        costScope(c) === "job" &&
        (!c.end_date || c.end_date >= start) &&
        c.start_date <= job.end_date!,
    );
    if (enteredJobCosts.length) {
      issues.push({
        label: `${job.contract_number}: entered job costs replace all projected job costs. Include field payroll and materials in those entries.`,
        href: `/settings`,
      });
    } else if (assumption?.cost_mode !== "explicit") {
      for (const cost of plan.costs)
        if (cost.amountCents > 0)
          sources.push({
            id: `${job.id}-projected-cost-${cost.date}`,
            date: cost.date,
            amountCents: -cost.amountCents,
            label: `${job.contract_number}: Projected job costs`,
            href,
            estimate: true,
            kind: "cost",
            projection: "job-cost",
          });
    } else
      issues.push({
        label: `${job.contract_number}: no entered job costs; cost modeling is disabled.`,
        href,
      });
    // No assumed retainage-release date: withheld projected amounts remain outside the forecast.
  }
  let balance = opening?.amount_cents ?? 0;
  const weeks = Array.from({ length: 13 }, (_, index) => {
    const start = addDays(startDate, index * 7),
      end = addDays(start, 6);
    const rows = sources
      .filter((s) => s.kind !== "opening" && s.date >= start && s.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const starting = balance;
    const inflow = rows.filter((s) => s.amountCents > 0).reduce((s, r) => s + r.amountCents, 0);
    const outflow = -rows.filter((s) => s.amountCents < 0).reduce((s, r) => s + r.amountCents, 0);
    let daily = balance,
      minimumCents = balance;
    let minimumDay = start;
    const days = [...new Set(rows.map((r) => r.date))].sort();
    for (const day of days) {
      daily += rows.filter((r) => r.date === day).reduce((sum, r) => sum + r.amountCents, 0);
      if (daily < minimumCents) {
        minimumCents = daily;
        minimumDay = day;
      }
    }
    balance += inflow - outflow;
    return {
      minimumCents,
      minimumDay,
      index,
      start,
      end,
      startingCents: starting,
      inflowCents: inflow,
      outflowCents: outflow,
      closingCents: balance,
      sources: rows,
    };
  });
  const lowest = weeks.reduce((a, b) => (b.minimumCents < a.minimumCents ? b : a));
  return {
    weeks,
    lowest,
    opening,
    sources,
    issues,
    isContribution: !!jobId && !opening,
    hasBalance: !!opening,
    hasActiveJobs: jobs.some((j) => j.status === "active"),
    hasIncoming: weeks.some((w) => w.inflowCents > 0),
  };
}
export function finalPaymentDate(invoice: Invoice, payments: Payment[]) {
  const totals = invoiceTotals(invoice, payments);
  return totals.remaining === 0
    ? (active(payments)
        .filter((p) => p.invoice_id === invoice.id && p.kind === "progress")
        .map((p) => p.received_date)
        .sort()
        .at(-1) ?? null)
    : null;
}
export { daysBetween };
