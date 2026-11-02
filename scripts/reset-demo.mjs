import { adminDb, ensureUser } from "./lib/admin.mjs";
import { randomUUID } from "node:crypto";
if (!process.env.DEMO_EMAIL || !process.env.DEMO_PASSWORD)
  throw new Error("Set server-only DEMO_EMAIL and DEMO_PASSWORD.");
const user = await ensureUser(process.env.DEMO_EMAIL, process.env.DEMO_PASSWORD);
const client = adminDb();
const date = new Date().toISOString().slice(0, 10);
const shift = (days) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
try {
  await client.begin(async (tx) => {
    const staff = await tx`select 1 from app.staff_users where user_id=${user.id}`;
    if (staff.length) throw new Error("Staff accounts cannot be demo accounts.");
    await tx`update app.government_invoices set status='accepted' where organization_id in (select id from app.organizations where is_demo) and status='paid'`;

    const [existing] = await tx`select id from app.organizations where is_demo`;
    if (existing) {
      const other =
        await tx`select 1 from app.memberships where user_id=${user.id} and organization_id<>${existing.id}`;
      if (other.length) throw new Error("Demo user has a real organization; refusing reset.");
      // Demo reset is privileged and transactional. Preserve append-only audit history.
      for (const name of [
        "government_payments",
        "government_invoices",
        "change_orders",
        "cash_balance_entries",
        "recurring_costs",
        "forecast_assumptions",
        "jobs",
      ])
        await tx.unsafe(
          `update app.${name} set ${["forecast_assumptions"].includes(name) ? "enabled=false" : "voided_at=now(),void_reason='Demo reset'"} where organization_id=$1`,
          [existing.id],
        );
      // Reuse demo org; use new contract/invoice identifiers on each reset.
    } else {
      const memberships = await tx`select 1 from app.memberships where user_id=${user.id}`;
      if (memberships.length) throw new Error("Demo user has an organization; refusing reset.");
    }
    const org = existing?.id ?? randomUUID();
    if (!existing)
      await tx`insert into app.organizations(id,name,origin,plan,is_demo,onboarding_complete) values(${org},'Demo Construction · fictional','demo','pilot',true,true)`;
    await tx`insert into app.memberships(organization_id,user_id,role) values(${org},${user.id},'member') on conflict do nothing`;
    const suffix = randomUUID().slice(0, 8),
      job = randomUUID(),
      second = randomUUID();
    await tx`insert into app.jobs(id,organization_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status) values
 (${job},${org},${"DEMO-PAVING-" + suffix},'Fictional federal agency','Demo, fictional data · depot paving',100000000,${shift(-60)},${shift(240)},500,14,'active'),
 (${second},${org},${"DEMO-REPAIR-" + suffix},'Fictional federal agency','Demo, fictional data · facility repairs',32500000,${shift(-30)},${shift(120)},0,14,'active')`;
    await tx`insert into app.change_orders(organization_id,job_id,reference,amount_cents,date,status,notes) values(${org},${job},'CO-01',5000000,${date},'pending','Demo, fictional data · scope under review')`;
    const invoice = randomUUID(),
      partial = randomUUID(),
      rejected = randomUUID();
    await tx`insert into app.government_invoices(id,organization_id,job_id,invoice_number,period_start,period_end,billed_cents,retainage_cents,submitted_date,proper_receipt_date,expected_payment_date,expected_retainage_date,payment_terms_days,portal,status,rejection_reason) values
 (${invoice},${org},${job},'DEMO-001',${shift(-30)},${shift(-1)},10000000,500000,${shift(-4)},${shift(-3)},${shift(11)},${shift(270)},14,'WAWF/PIEE','accepted',null),
 (${partial},${org},${second},'DEMO-002',${shift(-30)},${shift(-1)},5000000,0,${shift(-20)},${shift(-19)},${shift(3)},null,14,'IPP','accepted',null),
 (${rejected},${org},${job},'DEMO-003',${shift(-60)},${shift(-31)},4000000,200000,${shift(-15)},null,null,null,14,'other','rejected','Demo, fictional data · missing supporting schedule')`;
    await tx`insert into app.government_payments(organization_id,invoice_id,received_date,amount_cents,kind,reference) values(${org},${partial},${shift(-2)},2000000,'progress','Demo partial receipt')`;
    await tx`insert into app.cash_balance_entries(organization_id,amount_cents,as_of_date) values(${org},6500000,${date})`;
    await tx`insert into app.recurring_costs(organization_id,job_id,label,category,amount_cents,frequency,start_date) values(${org},${job},'Demo weekly payroll','payroll',1200000,'weekly',${shift(2)}),(${org},null,'Demo overhead','other',400000,'monthly',${shift(5)})`;
    await tx`insert into app.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode) values(${org},${job},true,8500,'even',10,45,60,'explicit')`;
  });
  console.log(
    "Demo reset complete. All fictional records remain isolated in the demo organization.",
  );
} finally {
  await client.end();
}
