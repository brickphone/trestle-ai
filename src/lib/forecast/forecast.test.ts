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
  // This original reference isolates entered invoices/costs; default job projections
  // have their own independently hand-calculated reference below.
  assumptions: [
    {
      id: "disabled",
      organization_id: "org",
      created_at: new Date("2026-01-01"),
      job_id: "job",
      enabled: false,
      cost_ratio_bps: 8500,
      cost_profile: "even",
      duration_months: 1,
      payment_lag_days: 30,
      retainage_release_days: 0,
      cost_mode: "explicit",
    },
  ],
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
    const modeled = result.sources.filter((s) => s.projection === "billing");
    expect(modeled[0]?.date).toBe("2026-04-14");
    expect(modeled[0]?.amountCents).toBe(9500000);
    expect(result.sources.some((s) => s.id === "assumption-cost-60")).toBe(false);
    const conflict = forecast(
      { ...data, assumptions: [{ ...assumption, cost_mode: "modeled" }] },
      "2026-02-01",
    );
    expect(conflict.issues.some((i) => i.label.includes("entered job costs replace"))).toBe(true);
    expect(conflict.sources.some((s) => s.projection === "billing")).toBe(true);
    expect(conflict.sources.some((s) => s.projection === "job-cost")).toBe(false);
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

const reference: ForecastData = {
  ...data,
  jobs: [
    { ...job, contract_value_cents: 120000000, start_date: "2026-01-01", end_date: "2026-06-30" },
  ],
  invoices: [],
  payments: [],
  changes: [],
  assumptions: [],
  balances: [{ ...balance, amount_cents: 10000000, as_of_date: "2026-01-01" }],
  costs: [
    {
      ...cost,
      id: "overhead",
      job_id: null,
      cost_scope: "overhead",
      label: "Monthly overhead",
      amount_cents: 2000000,
      frequency: "monthly",
      start_date: "2026-01-01",
    },
  ],
};
describe("remaining-work projections", () => {
  it("matches the hand-calculated sawtooth reference before the first government payment", () => {
    // $1.2m / 6 calendar months = $200k billed at each month end.
    // Job costs = 85% * $200k = $170k per month, paid in weekly slices.
    // Jan31 +30 days => first $190k net receipt on Mar2 (5% retainage).
    // Before that payment: $100k opening - Jan/Feb job costs ($340k)
    // - overhead on Jan1, Feb1 and Mar1 ($60k) = -$300k on Mar1.
    // This is the global low in 13 weeks; later monthly receipts create the sawtooth.
    const result = forecast(reference, "2026-01-01");
    expect(result.lowest.minimumCents).toBe(-30000000);
    expect(result.lowest.minimumDay).toBe("2026-03-01");
    const projected = result.sources.filter((s) => s.projection === "billing");
    expect(projected[0]?.date).toBe("2026-03-02");
    expect(projected[0]?.amountCents).toBe(19000000);
    expect(result.weeks.some((w) => w.inflowCents > 0)).toBe(true);
    expect(result.weeks.some((w) => w.closingCents > w.startingCents)).toBe(true);
    expect(
      result.sources
        .filter((s) => s.projection === "job-cost")
        .reduce((sum, s) => sum - s.amountCents, 0),
    ).toBe(102000000);
    expect(result.sources.every((s) => s.id && s.date && s.href)).toBe(true);
  });
  it("never double counts job ratio costs and separately entered office overhead/payroll", () => {
    const office = {
      ...cost,
      id: "office",
      job_id: null,
      cost_scope: "overhead" as const,
      label: "Weekly office payroll",
      amount_cents: 1000000,
      start_date: "2026-01-01",
    };
    const result = forecast({ ...reference, costs: [...reference.costs, office] }, "2026-01-01");
    // Jan..Mar job costs 510k + four overhead dates (80k) + 13 office payrolls (130k).
    expect(result.weeks.reduce((sum, w) => sum + w.outflowCents, 0)).toBe(72000000);
    const entered = {
      ...cost,
      id: "field",
      cost_scope: "job" as const,
      amount_cents: 100000,
      start_date: "2026-01-01",
    };
    const explicit = forecast({ ...reference, costs: [...reference.costs, entered] }, "2026-01-01");
    expect(explicit.sources.filter((s) => s.projection === "job-cost")).toHaveLength(0);
    expect(explicit.weeks.reduce((sum, w) => sum + w.outflowCents, 0)).toBe(9300000);
    expect(explicit.hasIncoming).toBe(true);
  });
  it("excludes unclassified legacy company payroll while modeling work and asks for classification", () => {
    const legacy = {
      ...cost,
      id: "legacy",
      job_id: null,
      cost_scope: "unclassified" as const,
      start_date: "2026-01-01",
    };
    const result = forecast({ ...reference, costs: [...reference.costs, legacy] }, "2026-01-01");
    expect(result.sources.some((s) => s.id.startsWith("legacy"))).toBe(false);
    expect(result.issues.some((i) => i.label.includes("classify"))).toBe(true);
  });
  it("replaces a projected period with its real invoice exactly once", () => {
    const real = {
      ...invoice,
      billed_cents: 20000000,
      retainage_cents: 1000000,
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      submitted_date: "2026-01-31",
      expected_payment_date: "2026-03-02",
    };
    const result = forecast({ ...reference, invoices: [real] }, "2026-01-01");
    const projections = result.sources.filter((s) => s.projection === "billing");
    expect(projections).toHaveLength(5);
    expect(projections.some((s) => s.period?.end === "2026-01-31")).toBe(false);
    expect(
      result.sources.filter((s) => s.date === "2026-03-02" && s.kind === "receipt"),
    ).toHaveLength(1);
    expect(projections.reduce((sum, s) => sum + s.amountCents, 0)).toBe(95000000);
  });
  it("uses obligations, allows explicit overrides, and counts opening billed amounts once", () => {
    const assumption = {
      ...data.assumptions[0]!,
      enabled: true,
      cost_mode: "modeled",
      payment_lag_days: 30,
      billed_before_tracking_cents: 20000000,
      billed_through_date: "2026-01-01",
    };
    const imported = {
      ...reference.jobs[0]!,
      obligated_cents: 120000000,
      contract_value_cents: 900000000,
    };
    const historical = {
      ...invoice,
      billed_cents: 20000000,
      submitted_date: "2025-12-31",
      period_start: "2025-12-01",
      period_end: "2025-12-31",
      status: "paid",
    };
    const result = forecast(
      { ...reference, jobs: [imported], assumptions: [assumption], invoices: [historical] },
      "2026-01-01",
    );
    expect(
      result.sources
        .filter((s) => s.projection === "billing")
        .reduce((sum, s) => sum + s.amountCents, 0),
    ).toBe(95000002); // Six per-invoice retainage roundings retain $49,999.98.
    const override = forecast(
      {
        ...reference,
        jobs: [imported],
        assumptions: [
          { ...assumption, billed_before_tracking_cents: 0, value_override_cents: 60000000 },
        ],
      },
      "2026-01-01",
    );
    expect(
      override.sources
        .filter((s) => s.projection === "billing")
        .reduce((sum, s) => sum + s.amountCents, 0),
    ).toBe(57000000);
  });
  it("warns instead of inventing income when value or future dates are missing", () => {
    for (const changed of [
      { contract_value_cents: null },
      { end_date: null },
      { end_date: "2025-12-31" },
    ]) {
      const result = forecast(
        { ...reference, jobs: [{ ...reference.jobs[0]!, ...changed }] },
        "2026-01-01",
      );
      expect(result.hasIncoming).toBe(false);
      expect(result.issues.some((i) => i.label.includes("needed for projected income"))).toBe(true);
    }
  });
});
