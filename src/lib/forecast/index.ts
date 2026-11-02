import type {
  Job,
  Invoice,
  Payment,
  ChangeOrder,
  Balance,
  RecurringCost,
  Assumption,
} from "../data/types";
import { addDays, daysBetween, invoiceDueDate, retainedCents } from "../finance";
import { calculateCashGap } from "../cashgap";
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
        : "Opening bank balance is missing for this forecast date.",
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
  const costs = active(data.costs).filter((c) => !jobId || c.job_id === jobId);
  if (
    costs.length === 0 &&
    !data.assumptions.some((a) => a.enabled && a.cost_mode === "modeled" && jobIds.has(a.job_id))
  )
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
    const assumption = data.assumptions.find((a) => a.job_id === job.id && a.enabled);
    if (!assumption) {
      if (job.status === "active")
        issues.push({
          label: `${job.contract_number}: future billings are not modeled.`,
          href: `/jobs/${job.id}#assumptions`,
        });
      continue;
    }
    const value = effectiveValue(job, data.changes);
    if (value === null || value < 0 || !job.start_date) {
      issues.push({
        label: `${job.contract_number}: value/start date needed for projected billings.`,
        href: `/jobs/${job.id}`,
      });
      continue;
    }
    if (assumption.cost_mode === "modeled" && costs.some((c) => c.job_id === job.id || !c.job_id)) {
      issues.push({
        label: `${job.contract_number}: modeled costs conflict with entered recurring costs; modeled scenario excluded.`,
        href: `/jobs/${job.id}#assumptions`,
      });
      continue;
    }
    const scenario = calculateCashGap({
      contractValueCents: value,
      durationMonths: assumption.duration_months,
      costRatio: assumption.cost_ratio_bps / 10000,
      paymentLagDays: assumption.payment_lag_days,
      retainageRatio: job.retainage_bps / 10000,
      retainageReleaseDays: assumption.retainage_release_days,
      costProfile: assumption.cost_profile as "even" | "front-loaded",
    });
    let unallocated = invoices
      .filter((i) => i.job_id === job.id && i.status !== "rejected")
      .reduce((s, i) => s + i.billed_cents, 0);
    let projectedRetention = 0;
    for (const event of scenario.timeline) {
      if (event.billingsCents) {
        const used = Math.min(unallocated, event.billingsCents);
        unallocated -= used;
        const billing = event.billingsCents - used;
        const billingDate = addDays(job.start_date, event.day);
        if (billing > 0 && billingDate >= startDate) {
          const retained = retainedCents(billing, job.retainage_bps);
          projectedRetention += retained;
          sources.push({
            id: `${assumption.id}-bill-${event.day}`,
            date: addDays(billingDate, assumption.payment_lag_days),
            amountCents: billing - retained,
            label: `${job.contract_number}: projected future billing`,
            href: `/jobs/${job.id}#assumptions`,
            estimate: true,
            kind: "receipt",
          });
        }
      }
      if (event.costsCents && assumption.cost_mode === "modeled")
        sources.push({
          id: `${assumption.id}-cost-${event.day}`,
          date: addDays(job.start_date, event.day),
          amountCents: -event.costsCents,
          label: `${job.contract_number}: modeled cost`,
          href: `/jobs/${job.id}#assumptions`,
          estimate: true,
          kind: "cost",
        });
    }
    if (projectedRetention)
      sources.push({
        id: `${assumption.id}-retained`,
        date: addDays(
          job.start_date,
          assumption.duration_months * 30 + assumption.retainage_release_days,
        ),
        amountCents: projectedRetention,
        label: `${job.contract_number}: projected retainage`,
        href: `/jobs/${job.id}#assumptions`,
        estimate: true,
        kind: "receipt",
      });
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
