/** Domain records. API timestamps are normalized to Date at the repository boundary. */
export type Organization = {
  id: string;
  name: string;
  uei: string | null;
  origin: string;
  plan: string;
  is_demo: boolean;
  onboarding_complete: boolean;
  created_at: Date;
};
export type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  created_at: Date;
};
export type StaffUser = { user_id: string; created_at: Date };
type RecordBase = { id: string; organization_id: string; created_at: Date };
type Financial = RecordBase & { voided_at: Date | null; void_reason: string | null };
export type SourceSnapshot = {
  id: string;
  organization_id: string;
  external_id: string;
  source_url: string;
  original: Record<string, unknown>;
  fetched_at: Date;
};
export type Job = Financial & {
  is_tracked?: boolean;
  obligated_cents?: number | null;
  source_snapshot_id: string | null;
  contract_number: string;
  agency: string | null;
  description: string | null;
  contract_value_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  retainage_bps: number;
  payment_terms_days: number;
  status: string;
};
export type ChangeOrder = Financial & {
  job_id: string;
  reference: string;
  amount_cents: number;
  date: string;
  status: string;
  notes: string | null;
};
export type Invoice = Financial & {
  job_id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  billed_cents: number;
  retainage_cents: number;
  submitted_date: string | null;
  proper_receipt_date: string | null;
  expected_payment_date: string | null;
  expected_retainage_date: string | null;
  payment_terms_days: number;
  portal: string;
  status: string;
  rejection_reason: string | null;
  resubmission_of_id: string | null;
};
export type Payment = Financial & {
  invoice_id: string;
  received_date: string;
  amount_cents: number;
  kind: string;
  reference: string | null;
};
export type Balance = Financial & {
  job_id: string | null;
  amount_cents: number;
  as_of_date: string;
};
export type RecurringCost = Financial & {
  cost_scope?: "job" | "overhead" | "unclassified";
  job_id: string | null;
  label: string;
  category: string;
  amount_cents: number;
  frequency: string;
  start_date: string;
  end_date: string | null;
};
export type Assumption = RecordBase & {
  billed_source?: "legacy" | "schedule" | "manual";
  billed_before_tracking_cents?: number;
  billed_through_date?: string | null;
  value_override_cents?: number | null;
  job_id: string;
  enabled: boolean;
  cost_ratio_bps: number;
  cost_profile: string;
  duration_months: number;
  payment_lag_days: number;
  retainage_release_days: number;
  cost_mode: string;
};
export type AuditEvent = RecordBase & {
  actor_id: string | null;
  operation: string;
  table_name: string;
  record_id: string;
  before_value: unknown;
  after_value: unknown;
};
