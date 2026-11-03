import { it, expect } from "vitest";
import { forecast } from ".";
import { jobDisplayName } from "../job-display";
import { billedScheduleWarning } from "../job-billing";
import { contractsDemo } from "@/components/product/tests/fixtures";
const job = {
  ...contractsDemo.jobs[0]!,
  id: "progress",
  description: "MCLB BARSTOW CONSTRUCT PARKING LOT",
  contract_value_cents: 600000000,
  obligated_cents: 600000000,
  start_date: "2024-01-01",
  end_date: "2026-06-30",
  retainage_bps: 500,
};
const assumption = {
  id: "a",
  organization_id: job.organization_id,
  job_id: job.id,
  created_at: new Date(),
  enabled: true,
  cost_ratio_bps: 8500,
  cost_profile: "even",
  duration_months: 1,
  payment_lag_days: 30,
  retainage_release_days: 0,
  cost_mode: "modeled",
  billed_before_tracking_cents: 480000000,
  billed_through_date: "2026-01-01",
};
const data = {
  ...contractsDemo,
  jobs: [job],
  assumptions: [assumption],
  snapshots: [],
  invoices: [],
  payments: [],
  costs: [],
  changes: [],
  balances: [{ ...contractsDemo.balances[0]!, as_of_date: "2026-01-01" }],
};
it("brings a two-year-old job's assumed December invoice into cash within 30 days, without charging past costs again", () => {
  const result = forecast(data, "2026-01-01");
  const pipeline = result.sources.filter((s) => s.projection === "assumed-receivable");
  // $4.8M billed / 24 closed months = $200k/month; 5% withheld = $190k net.
  expect(pipeline).toHaveLength(1);
  expect(pipeline[0]).toMatchObject({
    date: "2026-01-30",
    amountCents: 19000000,
    grossCents: 20000000,
    period: { start: "2025-12-01", end: "2025-12-31" },
  });
  expect(pipeline[0]!.label).toContain("Projected, assumed already invoiced, please confirm.");
  const future = result.sources.filter((s) => s.projection === "billing");
  expect(future.reduce((sum, s) => sum + s.grossCents!, 0)).toBe(120000000);
  // Only $1.2M unbilled work costs money going forward: 85% = $1.02M, not $5.1M.
  expect(
    result.sources
      .filter((s) => s.projection === "job-cost")
      .reduce((sum, s) => sum - s.amountCents, 0),
  ).toBe(102000000);
  expect(
    result.sources.filter((s) => s.projection === "job-cost").every((s) => s.date >= "2026-01-01"),
  ).toBe(true);
  expect(result.weeks.slice(0, 5).some((w) => w.inflowCents > 0)).toBe(true);
});
it("replaces each assumed period with a real invoice, including partial receipts and paid/draft periods", () => {
  const real = {
    ...contractsDemo.invoices[0]!,
    id: "december",
    job_id: job.id,
    period_start: "2025-12-01",
    period_end: "2025-12-31",
    submitted_date: "2025-12-31",
    expected_payment_date: "2026-01-30",
    billed_cents: 20000000,
    retainage_cents: 1000000,
    status: "accepted",
    expected_retainage_date: null,
  };
  const receipt = {
    ...contractsDemo.payments[0]!,
    invoice_id: real.id,
    amount_cents: 5000000,
    kind: "progress",
    received_date: "2025-12-31",
  };
  const result = forecast({ ...data, invoices: [real], payments: [receipt] }, "2026-01-01");
  expect(result.sources.filter((s) => s.projection === "assumed-receivable")).toHaveLength(0);
  expect(result.sources.filter((s) => s.date === "2026-01-30" && s.kind === "receipt")).toEqual([
    expect.objectContaining({ id: real.id, amountCents: 14000000 }),
  ]);
  for (const status of ["paid", "draft", "rejected"]) {
    const result = forecast({ ...data, invoices: [{ ...real, status }] }, "2026-01-01");
    expect(result.sources.filter((s) => s.projection === "assumed-receivable")).toHaveLength(0);
  }
});
it("keeps a different lag-month assumption when one period is replaced, and handles year boundaries", () => {
  const real = {
    ...contractsDemo.invoices[0]!,
    job_id: job.id,
    period_start: "2025-12-01",
    period_end: "2025-12-31",
    submitted_date: "2025-12-31",
    billed_cents: 20000000,
  };
  const result = forecast(
    { ...data, assumptions: [{ ...assumption, payment_lag_days: 60 }], invoices: [real] },
    "2026-01-01",
  );
  expect(
    result.sources.filter((s) => s.projection === "assumed-receivable").map((s) => s.period?.end),
  ).toEqual(["2025-11-30"]);
});
it("warns when a job is 80% complete on schedule but billed remains zero; entered billing clears the warning", () => {
  const old = { ...job, start_date: "2022-01-01", end_date: "2027-01-01" };
  const zero = { ...assumption, billed_before_tracking_cents: 0 };
  expect(billedScheduleWarning(old, zero, [], "2026-01-01")).toBe(
    "Billed so far is $0 but this job is 80% through its schedule, so the forecast may be overstated.",
  );
  const result = forecast({ ...data, jobs: [old], assumptions: [zero] }, "2026-01-01");
  expect(
    result.issues.some(
      (i) => i.label.includes("Billed so far is $0") && i.href === "/jobs/progress#billed-actual",
    ),
  ).toBe(true);
  expect(result.sources.some((s) => s.projection === "assumed-receivable")).toBe(false);
  expect(billedScheduleWarning(old, assumption, [], "2026-01-01")).toBeNull();
  expect(
    billedScheduleWarning({ ...old, start_date: "2026-02-01" }, zero, [], "2026-01-01"),
  ).toBeNull();
});
it("derives the same readable job name everywhere while preserving raw descriptions and IDs", () => {
  const before = JSON.stringify(job);
  expect(jobDisplayName(job)).toBe("MCLB Barstow parking lot");
  expect(jobDisplayName({ description: "My custom site name" })).toBe("My custom site name");
  expect(
    forecast(data, "2026-01-01")
      .sources.filter((s) => s.jobId === job.id)
      .every((s) => s.label.startsWith("MCLB Barstow parking lot:")),
  ).toBe(true);
  expect(JSON.stringify(job)).toBe(before);
});
