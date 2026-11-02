import { describe, it, expect } from "vitest";
import { forecast, invoiceTotals, effectiveValue, type ForecastData } from ".";
import type {
  Job,
  Invoice,
  Payment,
  RecurringCost,
  Balance,
  Assumption,
  ChangeOrder,
} from "../data/types";
const base = {
  organization_id: "org",
  created_at: new Date("2026-01-01"),
  voided_at: null,
  void_reason: null,
};
const job: Job = {
  ...base,
  id: "job",
  source_snapshot_id: null,
  contract_number: "Reference",
  agency: null,
  description: null,
  contract_value_cents: 100000000,
  start_date: "2026-01-01",
  end_date: "2026-10-28",
  retainage_bps: 500,
  payment_terms_days: 14,
  status: "active",
};
const invoice: Invoice = {
  ...base,
  id: "invoice",
  job_id: "job",
  invoice_number: "001",
  period_start: "2026-01-01",
  period_end: "2026-01-30",
  billed_cents: 10000000,
  retainage_cents: 500000,
  submitted_date: "2026-01-31",
  proper_receipt_date: null,
  expected_payment_date: "2026-02-05",
  expected_retainage_date: null,
  payment_terms_days: 14,
  portal: "IPP",
  status: "accepted",
  rejection_reason: null,
  resubmission_of_id: null,
};
const balance: Balance = {
  ...base,
  id: "balance",
  job_id: null,
  amount_cents: 2000000,
  as_of_date: "2026-02-01",
};
const cost: RecurringCost = {
  ...base,
  id: "cost",
  job_id: "job",
  label: "Payroll",
  category: "payroll",
  amount_cents: 1000000,
  frequency: "weekly",
  start_date: "2026-02-02",
  end_date: null,
};
const data: ForecastData = {
  jobs: [job],
  invoices: [invoice],
  payments: [],
  changes: [],
  balances: [balance],
  costs: [cost],
  assumptions: [],
};
describe("13-week forecast", () => {
  it("matches a hand-calculated 13-week reference and traces every entry", () => {
    // Opening $20k; week 1: $95k receipt - $10k payroll => $105k.
    // Weeks 2..13: $10k payroll each => -$15k at week 13.
    const result = forecast(data, "2026-02-01");
    expect(result.weeks).toHaveLength(13);
    expect(result.weeks.map((w) => w.closingCents / 100000)).toEqual([
      105, 95, 85, 75, 65, 55, 45, 35, 25, 15, 5, -5, -15,
    ]);
    expect(result.lowest.index).toBe(12);
    expect(result.lowest.closingCents).toBe(-1500000);
    expect(result.weeks[0]?.sources.map((s) => s.href)).toContain("/invoices/invoice");
    expect(result.sources.every((s) => s.href && s.id && s.date)).toBe(true);
  });
  it("replaces expected receipts with recorded partial payments exactly once", () => {
    const payment: Payment = {
      ...base,
      id: "payment",
      invoice_id: "invoice",
      received_date: "2026-02-03",
      amount_cents: 3000000,
      kind: "progress",
      reference: null,
    };
    const result = forecast({ ...data, payments: [payment] }, "2026-02-01");
    expect(result.weeks[0]?.inflowCents).toBe(9500000);
    expect(invoiceTotals(invoice, [payment]).remaining).toBe(6500000);
    const prior = { ...payment, received_date: "2026-01-31" };
    expect(forecast({ ...data, payments: [prior] }, "2026-02-01").weeks[0]?.inflowCents).toBe(
      6500000,
    );
  });
  it("never allocates company opening cash to a job", () => {
    const result = forecast(data, "2026-02-01", "job");
    expect(result.hasBalance).toBe(false);
    expect(result.isContribution).toBe(true);
    expect(result.weeks[0]?.startingCents).toBe(0);
  });
  it("excludes rejected/voided invoices and reports undated or overdue receivables", () => {
    const result = forecast(
      {
        ...data,
        invoices: [
          { ...invoice, status: "rejected" },
          { ...invoice, id: "late", expected_payment_date: "2026-01-01" },
          { ...invoice, id: "void", voided_at: new Date() },
        ],
      },
      "2026-02-01",
    );
    expect(result.weeks[0]?.inflowCents).toBe(0);
    expect(result.issues.some((i) => i.label.includes("rejected"))).toBe(true);
    expect(result.issues.some((i) => i.label.includes("current expected"))).toBe(true);
  });
  it("uses only approved change orders in contract value", () => {
    const change: ChangeOrder = {
      ...base,
      id: "co",
      job_id: "job",
      reference: "co",
      amount_cents: 5000000,
      date: "2026-02-01",
      status: "pending",
      notes: null,
    };
    expect(effectiveValue(job, [change])).toBe(100000000);
    expect(effectiveValue(job, [{ ...change, status: "approved" }])).toBe(105000000);
  });
  it("projects only unbilled future work and prevents modeled/explicit cost overlap", () => {
    const assumption: Assumption = {
      id: "assumption",
      organization_id: "org",
      created_at: new Date(),
      job_id: "job",
      enabled: true,
      cost_ratio_bps: 8500,
      cost_profile: "even",
      duration_months: 10,
      payment_lag_days: 45,
      retainage_release_days: 60,
      cost_mode: "explicit",
    };
    const result = forecast({ ...data, assumptions: [assumption] }, "2026-02-01");
    const modeled = result.sources.filter((s) => s.id.startsWith("assumption-bill"));
    expect(modeled[0]?.date).toBe("2026-04-16");
    expect(modeled[0]?.amountCents).toBe(9500000);
    expect(result.sources.some((s) => s.id === "assumption-cost-60")).toBe(false);
    const conflict = forecast(
      { ...data, assumptions: [{ ...assumption, cost_mode: "modeled" }] },
      "2026-02-01",
    );
    expect(conflict.issues.some((i) => i.label.includes("conflict"))).toBe(true);
    expect(conflict.sources.some((s) => s.id.startsWith("assumption"))).toBe(false);
  });
  it("keeps monthly dates anchored through February and excludes voided costs", () => {
    const result = forecast(
      {
        ...data,
        invoices: [],
        costs: [
          { ...cost, frequency: "monthly", start_date: "2026-01-31" },
          { ...cost, id: "void", voided_at: new Date() },
        ],
      },
      "2026-02-01",
    );
    expect(result.sources.filter((s) => s.kind === "cost").map((s) => s.date)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
  it("finds a cash shortfall inside a week even when the week closes positive", () => {
    const result = forecast(
      { ...data, costs: [{ ...cost, amount_cents: 3000000, end_date: "2026-02-02" }] },
      "2026-02-01",
    );
    expect(result.lowest.index).toBe(0);
    expect(result.lowest.minimumCents).toBe(-1000000);
    expect(result.lowest.minimumDay).toBe("2026-02-02");
    expect(result.weeks[0]?.closingCents).toBe(8500000);
  });
});
