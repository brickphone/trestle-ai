import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { userDataClient } from "../supabase/server";
import { readAll, normalize } from "../supabase/rows";
import type { ApiRow } from "../supabase/database.types";
import type {
  Organization,
  Membership,
  StaffUser,
  SourceSnapshot,
  Job,
  ChangeOrder,
  Invoice,
  Payment,
  Balance,
  RecurringCost,
  Assumption,
  AuditEvent,
} from "./types";
export const context = cache(async () => {
  const selected = (await cookies()).get("organization")?.value;
  const client = await userDataClient();
  const [staffRows, memberRows, organizationRows] = await Promise.all([
    readAll(client, "staff_users"),
    readAll(client, "memberships"),
    readAll(client, "organizations"),
  ]);
  const staff = (staffRows as ApiRow<StaffUser>[]).map(normalize<StaffUser>);
  const members = (memberRows as ApiRow<Membership>[]).map(normalize<Membership>);
  const orgs = (organizationRows as ApiRow<Organization>[])
    .map(normalize<Organization>)
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const organization =
    orgs.find((o) => o.id === selected) ??
    orgs.find((o) => members.some((m) => m.organization_id === o.id)) ??
    (staff.length ? orgs[0] : undefined);
  return {
    organization,
    organizations: orgs,
    isStaff: staff.length > 0,
    readOnly: staff.length > 0 || !!organization?.is_demo,
  };
});
export async function requireOrganization() {
  const ctx = await context();
  if (!ctx.organization) redirect("/onboarding");
  return { ...ctx, organization: ctx.organization };
}
export const loadData = cache(async () => {
  const ctx = await requireOrganization();
  const client = await userDataClient();
  const org = ctx.organization.id;
  const tables = [
    "jobs",
    "change_orders",
    "government_invoices",
    "government_payments",
    "cash_balance_entries",
    "recurring_costs",
    "forecast_assumptions",
    "source_snapshots",
  ] as const;
  const rows = await Promise.all(tables.map((table) => readAll(client, table, org)));
  return {
    ...ctx,
    jobs: (rows[0] as ApiRow<Job>[]).map(normalize<Job>),
    changes: (rows[1] as ApiRow<ChangeOrder>[]).map(normalize<ChangeOrder>),
    invoices: (rows[2] as ApiRow<Invoice>[]).map(normalize<Invoice>),
    payments: (rows[3] as ApiRow<Payment>[]).map(normalize<Payment>),
    balances: (rows[4] as ApiRow<Balance>[])
      .map(normalize<Balance>)
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime()),
    costs: (rows[5] as ApiRow<RecurringCost>[]).map(normalize<RecurringCost>),
    assumptions: (rows[6] as ApiRow<Assumption>[]).map(normalize<Assumption>),
    snapshots: (rows[7] as ApiRow<SourceSnapshot>[]).map(normalize<SourceSnapshot>),
  };
});
export async function recordHistory(recordId: string) {
  const ctx = await requireOrganization();
  const client = await userDataClient();
  const rows = (await readAll(client, "audit_events", ctx.organization.id)) as ApiRow<AuditEvent>[];
  return rows
    .filter((r) => r.record_id === recordId)
    .map(normalize<AuditEvent>)
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
}
