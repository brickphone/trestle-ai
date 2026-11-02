import "server-only";
import {
  pgSchema,
  uuid,
  text,
  boolean,
  integer,
  bigint,
  date,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
export const appSchema = pgSchema("app");
const id = () => uuid("id").primaryKey().defaultRandom();
const org = () => uuid("organization_id").notNull();
const money = (name: string) => bigint(name, { mode: "number" });
const created = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const voidFields = () => ({
  voided_at: timestamp("voided_at", { withTimezone: true }),
  void_reason: text("void_reason"),
});
export const organizations = appSchema.table("organizations", {
  id: id(),
  name: text("name").notNull(),
  uei: text("uei"),
  origin: text("origin").notNull(),
  plan: text("plan").notNull(),
  is_demo: boolean("is_demo").notNull(),
  onboarding_complete: boolean("onboarding_complete").notNull(),
  created_at: created(),
});
export const memberships = appSchema.table("memberships", {
  id: id(),
  organization_id: org(),
  user_id: uuid("user_id").notNull(),
  role: text("role").notNull(),
  created_at: created(),
});
export const staffUsers = appSchema.table("staff_users", {
  user_id: uuid("user_id").primaryKey(),
  created_at: created(),
});
export const sourceSnapshots = appSchema.table("source_snapshots", {
  id: id(),
  organization_id: org(),
  external_id: text("external_id").notNull(),
  source_url: text("source_url").notNull(),
  original: jsonb("original").$type<Record<string, unknown>>().notNull(),
  fetched_at: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
});
export const jobs = appSchema.table("jobs", {
  id: id(),
  organization_id: org(),
  source_snapshot_id: uuid("source_snapshot_id"),
  contract_number: text("contract_number").notNull(),
  agency: text("agency"),
  description: text("description"),
  contract_value_cents: money("contract_value_cents"),
  start_date: date("start_date"),
  end_date: date("end_date"),
  retainage_bps: integer("retainage_bps").notNull(),
  payment_terms_days: integer("payment_terms_days").notNull(),
  status: text("status").notNull(),
  ...voidFields(),
  created_at: created(),
});
export const changeOrders = appSchema.table("change_orders", {
  id: id(),
  organization_id: org(),
  job_id: uuid("job_id").notNull(),
  reference: text("reference").notNull(),
  amount_cents: money("amount_cents").notNull(),
  date: date("date").notNull(),
  status: text("status").notNull(),
  notes: text("notes"),
  ...voidFields(),
  created_at: created(),
});
export const governmentInvoices = appSchema.table("government_invoices", {
  id: id(),
  organization_id: org(),
  job_id: uuid("job_id").notNull(),
  invoice_number: text("invoice_number").notNull(),
  period_start: date("period_start").notNull(),
  period_end: date("period_end").notNull(),
  billed_cents: money("billed_cents").notNull(),
  retainage_cents: money("retainage_cents").notNull(),
  submitted_date: date("submitted_date"),
  proper_receipt_date: date("proper_receipt_date"),
  expected_payment_date: date("expected_payment_date"),
  expected_retainage_date: date("expected_retainage_date"),
  payment_terms_days: integer("payment_terms_days").notNull(),
  portal: text("portal").notNull(),
  status: text("status").notNull(),
  rejection_reason: text("rejection_reason"),
  resubmission_of_id: uuid("resubmission_of_id"),
  ...voidFields(),
  created_at: created(),
});
export const governmentPayments = appSchema.table("government_payments", {
  id: id(),
  organization_id: org(),
  invoice_id: uuid("invoice_id").notNull(),
  received_date: date("received_date").notNull(),
  amount_cents: money("amount_cents").notNull(),
  kind: text("kind").notNull(),
  reference: text("reference"),
  ...voidFields(),
  created_at: created(),
});
export const cashBalanceEntries = appSchema.table("cash_balance_entries", {
  id: id(),
  organization_id: org(),
  job_id: uuid("job_id"),
  amount_cents: money("amount_cents").notNull(),
  as_of_date: date("as_of_date").notNull(),
  ...voidFields(),
  created_at: created(),
});
export const recurringCosts = appSchema.table("recurring_costs", {
  id: id(),
  organization_id: org(),
  job_id: uuid("job_id"),
  label: text("label").notNull(),
  category: text("category").notNull(),
  amount_cents: money("amount_cents").notNull(),
  frequency: text("frequency").notNull(),
  start_date: date("start_date").notNull(),
  end_date: date("end_date"),
  ...voidFields(),
  created_at: created(),
});
export const forecastAssumptions = appSchema.table("forecast_assumptions", {
  id: id(),
  organization_id: org(),
  job_id: uuid("job_id").notNull(),
  enabled: boolean("enabled").notNull(),
  cost_ratio_bps: integer("cost_ratio_bps").notNull(),
  cost_profile: text("cost_profile").notNull(),
  duration_months: integer("duration_months").notNull(),
  payment_lag_days: integer("payment_lag_days").notNull(),
  retainage_release_days: integer("retainage_release_days").notNull(),
  cost_mode: text("cost_mode").notNull(),
  created_at: created(),
});
export const auditEvents = appSchema.table("audit_events", {
  id: id(),
  organization_id: org(),
  actor_id: uuid("actor_id"),
  operation: text("operation").notNull(),
  table_name: text("table_name").notNull(),
  record_id: uuid("record_id").notNull(),
  before_value: jsonb("before_value"),
  after_value: jsonb("after_value"),
  created_at: created(),
});
export type Job = typeof jobs.$inferSelect;
export type Invoice = typeof governmentInvoices.$inferSelect;
export type Payment = typeof governmentPayments.$inferSelect;
export type ChangeOrder = typeof changeOrders.$inferSelect;
export type Balance = typeof cashBalanceEntries.$inferSelect;
export type RecurringCost = typeof recurringCosts.$inferSelect;
export type Assumption = typeof forecastAssumptions.$inferSelect;
