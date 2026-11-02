import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { and, eq, desc, sql } from "drizzle-orm";
import { withDb } from "../db";
import * as s from "../db/schema";
import { redirect } from "next/navigation";
export const context = cache(async () => {
  const selected = (await cookies()).get("organization")?.value;
  return withDb(async (tx) => {
    const [staff] = await tx.select().from(s.staffUsers);
    const memberRows = await tx.select().from(s.memberships);
    const orgs = await tx.select().from(s.organizations).orderBy(s.organizations.created_at);
    const organization =
      orgs.find((o) => o.id === selected) ??
      orgs.find((o) => memberRows.some((m) => m.organization_id === o.id)) ??
      (staff ? orgs[0] : undefined);
    return {
      organization,
      organizations: orgs,
      isStaff: !!staff,
      readOnly: !!staff || !!organization?.is_demo,
    };
  });
});
export async function requireOrganization() {
  const ctx = await context();
  if (!ctx.organization) redirect("/onboarding");
  return { ...ctx, organization: ctx.organization };
}
export const loadData = cache(async () => {
  const ctx = await requireOrganization();
  const org = ctx.organization.id;
  const data = await withDb(async (tx) => ({
    jobs: await tx.select().from(s.jobs).where(eq(s.jobs.organization_id, org)),
    changes: await tx.select().from(s.changeOrders).where(eq(s.changeOrders.organization_id, org)),
    invoices: await tx
      .select()
      .from(s.governmentInvoices)
      .where(eq(s.governmentInvoices.organization_id, org)),
    payments: await tx
      .select()
      .from(s.governmentPayments)
      .where(eq(s.governmentPayments.organization_id, org)),
    balances: await tx
      .select()
      .from(s.cashBalanceEntries)
      .where(eq(s.cashBalanceEntries.organization_id, org))
      .orderBy(desc(s.cashBalanceEntries.created_at)),
    costs: await tx
      .select()
      .from(s.recurringCosts)
      .where(eq(s.recurringCosts.organization_id, org)),
    assumptions: await tx
      .select()
      .from(s.forecastAssumptions)
      .where(eq(s.forecastAssumptions.organization_id, org)),
    snapshots: await tx
      .select()
      .from(s.sourceSnapshots)
      .where(eq(s.sourceSnapshots.organization_id, org)),
  }));
  return { ...ctx, ...data };
});
export async function recordHistory(recordId: string) {
  const ctx = await requireOrganization();
  return withDb((tx) =>
    tx
      .select()
      .from(s.auditEvents)
      .where(
        and(
          eq(s.auditEvents.organization_id, ctx.organization.id),
          eq(s.auditEvents.record_id, recordId),
        ),
      )
      .orderBy(desc(s.auditEvents.created_at)),
  );
}
export async function assertRuntime() {
  return withDb((tx) =>
    tx.execute(
      sql`select current_user,session_user,row_security_active('app.jobs'::regclass) as rls_active`,
    ),
  );
}
