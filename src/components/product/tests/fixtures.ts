import type { loadData } from "@/lib/data/repository";
type Data = Awaited<ReturnType<typeof loadData>>;
/** Isolated test records only; never imported by routes or persisted. */
const base = {
  organization_id: "demo-org",
  created_at: new Date("2026-11-02T12:00:00Z"),
  voided_at: null,
  void_reason: null,
};
const job = {
  ...base,
  id: "demo-job",
  source_snapshot_id: null,
  contract_number: "DEMO-VA-026",
  agency: "Department of Veterans Affairs",
  description: "Demo clinic renovation",
  contract_value_cents: 125000000,
  start_date: "2026-08-01",
  end_date: "2027-05-31",
  retainage_bps: 500,
  payment_terms_days: 14,
  status: "active",
};
const invoice = {
  ...base,
  id: "demo-invoice-1",
  job_id: job.id,
  invoice_number: "PAY-004",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  billed_cents: 12200000,
  retainage_cents: 610000,
  submitted_date: "2026-10-29",
  proper_receipt_date: "2026-10-29",
  expected_payment_date: "2026-11-12",
  expected_retainage_date: "2027-06-30",
  payment_terms_days: 14,
  portal: "IPP",
  status: "accepted",
  rejection_reason: null,
  resubmission_of_id: null,
};
const organization = {
  id: "demo-org",
  name: "Alder Federal Builders · Demo",
  uei: null,
  origin: "manual",
  plan: "pilot",
  is_demo: true,
  onboarding_complete: true,
  created_at: base.created_at,
};
export const demo: Data = {
  organization,
  organizations: [organization],
  isOwner: true,
  isStaff: false,
  readOnly: true,
  jobs: [
    job,
    {
      ...job,
      id: "demo-job-2",
      contract_number: "DEMO-GSA-018",
      agency: "General Services Administration",
      description: "Demo federal office mechanical upgrade",
      contract_value_cents: 84000000,
      end_date: "2027-03-31",
    },
  ],
  changes: [
    {
      ...base,
      id: "demo-change",
      job_id: job.id,
      reference: "CO-02",
      amount_cents: 4200000,
      date: "2026-10-20",
      status: "pending",
      notes: "Demo additional scope",
    },
  ],
  invoices: [
    invoice,
    {
      ...invoice,
      id: "demo-invoice-2",
      job_id: "demo-job-2",
      invoice_number: "PAY-002",
      billed_cents: 8200000,
      retainage_cents: 410000,
      proper_receipt_date: null,
      expected_payment_date: "2026-11-23",
      status: "submitted",
    },
    {
      ...invoice,
      id: "demo-invoice-3",
      invoice_number: "PAY-003",
      billed_cents: 1400000,
      retainage_cents: 70000,
      status: "rejected",
      rejection_reason: "Demo: supporting schedule needed",
    },
  ],
  payments: [
    {
      ...base,
      id: "demo-payment",
      invoice_id: invoice.id,
      amount_cents: 2500000,
      received_date: "2026-10-30",
      kind: "progress",
      reference: "Demo partial receipt",
    },
  ],
  balances: [
    { ...base, id: "demo-balance", job_id: null, amount_cents: 12950000, as_of_date: "2026-11-02" },
  ],
  costs: [
    {
      ...base,
      id: "demo-payroll",
      job_id: null,
      label: "Weekly payroll",
      category: "payroll",
      amount_cents: 1850000,
      frequency: "weekly",
      start_date: "2026-11-06",
      end_date: null,
    },
    {
      ...base,
      id: "demo-overhead",
      job_id: null,
      label: "Rent & operating costs",
      category: "other",
      amount_cents: 450000,
      frequency: "monthly",
      start_date: "2026-11-05",
      end_date: null,
    },
  ],
  assumptions: [],
  snapshots: [],
};

// Sales-review scenario: three jobs, twelve pay apps, lumpy receipts and a real cash dip.
// These records are fixtures only. No production organization or data model is changed.
demo.jobs.push({
  ...job,
  id: "demo-job-3",
  contract_number: "DEMO-USACE-041",
  agency: "Army Corps of Engineers",
  description: "Demo maintenance facility rehabilitation",
  contract_value_cents: 186000000,
  end_date: "2027-08-31",
});
demo.balances[0]!.amount_cents = 8500000;
for (let index = 0; index < 4; index++) {
  const id = `demo-paid-${index}`;
  const billed = (32000 + index * 11000) * 100;
  demo.invoices.push({
    ...invoice,
    id,
    job_id: demo.jobs[index % 3]!.id,
    invoice_number: `PAY-00${index + 5}`,
    billed_cents: billed,
    retainage_cents: Math.round(billed * 0.05),
    submitted_date: "2026-10-01",
    proper_receipt_date: "2026-10-01",
    expected_payment_date: "2026-10-15",
    status: "paid",
  });
  demo.payments.push({
    ...base,
    id: `${id}-receipt`,
    invoice_id: id,
    amount_cents: billed - Math.round(billed * 0.05),
    received_date: "2026-10-15",
    kind: "progress",
    reference: "Demo recorded receipt",
  });
}
demo.invoices.push(
  {
    ...invoice,
    id: "demo-invoice-8",
    job_id: "demo-job-3",
    invoice_number: "PAY-009",
    billed_cents: 8000000,
    retainage_cents: 400000,
    submitted_date: "2026-11-01",
    proper_receipt_date: null,
    expected_payment_date: "2026-12-10",
    status: "submitted",
  },
  {
    ...invoice,
    id: "demo-invoice-9",
    invoice_number: "PAY-010",
    billed_cents: 12500000,
    retainage_cents: 625000,
    submitted_date: "2026-11-01",
    proper_receipt_date: "2026-11-01",
    expected_payment_date: "2027-01-14",
    status: "accepted",
  },
  {
    ...invoice,
    id: "demo-late-1",
    invoice_number: "PAY-011",
    billed_cents: 5400000,
    retainage_cents: 270000,
    submitted_date: "2026-10-01",
    proper_receipt_date: "2026-10-01",
    expected_payment_date: "2026-10-15",
    status: "submitted",
  },
  {
    ...invoice,
    id: "demo-late-2",
    job_id: "demo-job-3",
    invoice_number: "PAY-012",
    billed_cents: 3600000,
    retainage_cents: 180000,
    submitted_date: "2026-10-10",
    proper_receipt_date: null,
    expected_payment_date: "2026-10-24",
    status: "accepted",
  },
  {
    ...invoice,
    id: "demo-draft",
    job_id: "demo-job-3",
    invoice_number: "PAY-013",
    billed_cents: 4250000,
    retainage_cents: 212500,
    submitted_date: null,
    proper_receipt_date: null,
    expected_payment_date: null,
    status: "draft",
  },
);
for (const [id, label, amount, date, jobId] of [
  [
    "demo-sub-1",
    "Atlas Electrical · manual sub payment estimate",
    2800000,
    "2026-11-09",
    "demo-job",
  ],
  [
    "demo-sub-2",
    "Cedar Mechanical · manual sub payment estimate",
    2200000,
    "2026-11-20",
    "demo-job-2",
  ],
  [
    "demo-sub-3",
    "Ridgeway Concrete · manual sub payment estimate",
    3500000,
    "2026-12-08",
    "demo-job-3",
  ],
] as const)
  demo.costs.push({
    ...base,
    id,
    job_id: jobId,
    label,
    category: "other",
    amount_cents: amount,
    frequency: "weekly",
    start_date: date,
    end_date: date,
  });

/** Fictional, hand-calculated forecast reference. Never seeded into a real organization. */
export const projectedDemo: typeof demo = {
  ...demo,
  jobs: [
    {
      ...demo.jobs[0]!,
      contract_value_cents: 120000000,
      start_date: "2026-01-01",
      end_date: "2026-06-30",
      retainage_bps: 500,
      status: "active",
    },
  ],
  changes: [],
  invoices: [],
  payments: [],
  assumptions: [],
  balances: [{ ...demo.balances[0]!, amount_cents: 10000000, as_of_date: "2026-01-01" }],
  costs: [
    {
      ...demo.costs[0]!,
      id: "projected-overhead",
      job_id: null,
      cost_scope: "overhead",
      category: "other",
      label: "Monthly overhead",
      frequency: "monthly",
      amount_cents: 2000000,
      start_date: "2026-01-01",
      end_date: null,
    },
  ],
};

/** Isolated owner-edit fixture; no production authentication shortcut. */
export const editDemo: typeof demo = {
  ...demo,
  organization: {
    ...demo.organization,
    id: "10000000-0000-4000-8000-000000000001",
    uei: "HSNPS86TJGM6",
    is_demo: false,
  },
  readOnly: false,
  isOwner: true,
  balances: [{ ...demo.balances[0]!, amount_cents: 25000000 }],
  costs: [
    {
      ...demo.costs[0]!,
      id: "setup-monthly",
      job_id: null,
      cost_scope: "overhead",
      label: "Monthly overhead",
      start_date: "2026-11-02",
      frequency: "monthly",
      category: "other",
      amount_cents: 3500000,
    },
    {
      ...demo.costs[0]!,
      id: "setup-office",
      job_id: null,
      cost_scope: "overhead",
      label: "Weekly office payroll",
      start_date: "2026-11-02",
      frequency: "weekly",
      category: "payroll",
      amount_cents: 500000,
    },
  ],
};

/** Genuine public task-order responses; operational edit fixture only, never persisted. */
import cjw from "@/lib/usaspending/fixtures/cjw-task-orders.json";
export const contractsDemo: typeof demo = {
  ...editDemo,
  organization: { ...editDemo.organization, name: "C J W CONSTRUCTION, INC.", uei: "MY4DNWXWL7M1" },
  assumptions: [],
  jobs: cjw.records.map((record, index) => ({
    ...demo.jobs[0]!,
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    organization_id: editDemo.organization.id,
    source_snapshot_id: `source-${index}`,
    contract_number: `Task order ${record.detail.piid} under ${record.detail.parent_award.piid}`,
    agency: record.detail.parent_award.agency_name,
    description: record.detail.description,
    start_date: record.detail.period_of_performance.start_date,
    end_date: record.detail.period_of_performance.end_date,
    contract_value_cents: record.detail.base_and_all_options * 100,
    obligated_cents: null,
  })),
  snapshots: cjw.records.map((record, index) => ({
    id: `source-${index}`,
    organization_id: editDemo.organization.id,
    external_id: record.searchRow.generated_internal_id,
    source_url: `https://www.usaspending.gov/award/${record.searchRow.generated_internal_id}`,
    original: {
      obligationsCents: record.detail.total_obligation * 100,
      contractValueCents: record.detail.base_and_all_options * 100,
      description: record.detail.description,
      isTaskOrder: true,
      parentAwardId: record.detail.parent_award.piid,
      placeOfPerformanceCity: null,
      placeOfPerformanceState: null,
    },
    fetched_at: new Date(cjw.recordedAt),
  })),
};
export const missingContractsDemo: typeof contractsDemo = {
  ...contractsDemo,
  jobs: [{ ...contractsDemo.jobs[0]!, obligated_cents: null, contract_value_cents: null }],
  snapshots: contractsDemo.snapshots.map((s) => ({
    ...s,
    original: { ...s.original, obligationsCents: null, contractValueCents: null },
  })),
};
