import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";
import { verifyUserClient, unwrap } from "../src/lib/supabase/security";
if (process.env.ALLOW_DATABASE_TESTS !== "true")
  throw new Error("Set ALLOW_DATABASE_TESTS=true only for a dedicated hosted TEST project.");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || !secret)
  throw new Error(
    "Configure the test project URL, publishable key, and administrative Auth key. No database URL is needed.",
  );
const admin = createClient<Database>(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function actor() {
  const email = `rls-${randomUUID()}@example.com`,
    password = randomUUID() + "-Test1";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient<Database>(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, client };
}
async function org(client: SupabaseClient<Database>, name: string) {
  return unwrap(
    await client.rpc("complete_onboarding", {
      company_name: name,
      company_uei: null,
      company_origin: "manual",
      awards: [],
      opening_balance: 0,
      balance_date: new Date().toISOString().slice(0, 10),
      payroll: null,
      retainage_bps: 500,
      payment_terms_days: 14,
    }),
  );
}
const a = await actor(),
  b = await actor(),
  staff = await actor();
const orgA = await org(a.client, "RLS TEST A"),
  orgB = await org(b.client, "RLS TEST B");
const jobA = unwrap(
  await a.client
    .from("jobs")
    .insert({
      organization_id: orgA,
      contract_number: "RLS TEST A",
      retainage_bps: 0,
      payment_terms_days: 14,
      status: "active",
    })
    .select()
    .single(),
);
const jobB = unwrap(
  await b.client
    .from("jobs")
    .insert({
      organization_id: orgB,
      contract_number: "RLS TEST B",
      retainage_bps: 0,
      payment_terms_days: 14,
      status: "active",
    })
    .select()
    .single(),
);
let passed = 0;
async function check(name: string, test: () => Promise<void>) {
  await test();
  passed++;
  console.log(`PASS ${name}`);
}
await check("ordinary requests use the authenticated JWT and active table RLS", async () => {
  await verifyUserClient(a.client, a.id);
});
await check("the actual request guard rejects a service-role bypass client", async () => {
  await assert.rejects(() => verifyUserClient(admin), /Unsafe Supabase client/);
});
await check("unfiltered reads cannot see another organization", async () => {
  const rows = unwrap(await a.client.from("jobs").select());
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, jobA.id);
  assert.equal(unwrap(await a.client.from("jobs").select().eq("id", jobB.id)).length, 0);
});
await check("cross-organization writes and composite links fail", async () => {
  assert(
    (
      await a.client.from("jobs").insert({
        organization_id: orgB,
        contract_number: "ATTACK",
        retainage_bps: 0,
        payment_terms_days: 14,
        status: "active",
      })
    ).error,
  );
  assert.equal(
    unwrap(await a.client.from("jobs").update({ description: "ATTACK" }).eq("id", jobB.id).select())
      .length,
    0,
  );
  assert(
    (
      await a.client.from("change_orders").insert({
        organization_id: orgA,
        job_id: jobB.id,
        reference: "ATTACK",
        amount_cents: 1,
        date: "2026-01-01",
        status: "pending",
      })
    ).error,
  );
});
await check(
  "a failed onboarding call rolls back organization and membership together",
  async () => {
    const c = await actor();
    const failed = await c.client.rpc("complete_onboarding", {
      company_name: "ROLLED BACK TEST",
      company_uei: null,
      company_origin: "manual",
      awards: [
        {
          externalId: "invalid",
          sourceUrl: "https://www.usaspending.gov/award/invalid",
          contractNumber: "INVALID",
          contractValueCents: -1,
        },
      ],
      opening_balance: 0,
      balance_date: "2026-01-01",
      payroll: null,
      retainage_bps: 500,
      payment_terms_days: 14,
    });
    assert(failed.error);
    assert.equal(unwrap(await c.client.from("organizations").select()).length, 0);
    assert.equal(unwrap(await c.client.from("memberships").select()).length, 0);
    await org(c.client, "RECOVERED TEST");
    assert.equal(unwrap(await c.client.from("organizations").select()).length, 1);
  },
);
await check("staff can read all organizations but cannot edit financial records", async () => {
  unwrap(await admin.rpc("provision_staff", { target_user: staff.id }));
  const rows = unwrap(await staff.client.from("jobs").select());
  assert(rows.some((r) => r.id === jobA.id) && rows.some((r) => r.id === jobB.id));
  assert.equal(
    unwrap(
      await staff.client.from("jobs").update({ description: "ATTACK" }).eq("id", jobA.id).select(),
    ).length,
    0,
  );
  assert(
    (
      await staff.client.from("jobs").insert({
        organization_id: orgA,
        contract_number: "STAFF ATTACK",
        retainage_bps: 0,
        payment_terms_days: 14,
        status: "active",
      })
    ).error,
  );
});
await check("ordinary users cannot invoke administrative functions", async () => {
  assert((await a.client.rpc("provision_staff", { target_user: a.id })).error);
  assert((await a.client.rpc("reset_demo", { demo_user_id: a.id })).error);
});
await check("financial edits are audited and audit rows cannot be changed", async () => {
  unwrap(
    await a.client
      .from("jobs")
      .update({ description: "Audited edit" })
      .eq("id", jobA.id)
      .select()
      .single(),
  );
  const rows = unwrap(
    await a.client.from("audit_events").select().eq("record_id", jobA.id).eq("operation", "UPDATE"),
  );
  assert.equal(rows.at(-1)?.actor_id, a.id);
  assert.equal((rows.at(-1)?.after_value as { description: string }).description, "Audited edit");
  assert((await a.client.from("audit_events").delete().eq("record_id", jobA.id)).error);
  assert(
    (await a.client.from("audit_events").update({ operation: "TAMPER" }).eq("record_id", jobA.id))
      .error,
  );
});
await check("payments are atomic, bounded, and update paid status", async () => {
  const invoice = unwrap(
    await a.client.rpc("save_government_invoice", {
      org_id: orgA,
      invoice_id: null,
      invoice_values: {
        job_id: jobA.id,
        invoice_number: "RLS TEST",
        period_start: "2026-01-01",
        period_end: "2026-01-31",
        billed_cents: 10000,
        retainage_cents: 500,
        submitted_date: "2026-02-01",
        portal: "IPP",
        status: "submitted",
      },
    }),
  );
  unwrap(
    await a.client.rpc("record_government_payment", {
      org_id: orgA,
      payment_values: {
        invoice_id: invoice,
        received_date: "2026-02-15",
        amount_cents: 4000,
        kind: "progress",
      },
    }),
  );
  assert(
    (
      await a.client.rpc("record_government_payment", {
        org_id: orgA,
        payment_values: {
          invoice_id: invoice,
          received_date: "2026-02-15",
          amount_cents: 6000,
          kind: "progress",
        },
      })
    ).error,
  );
  assert.equal(
    unwrap(await a.client.from("government_payments").select().eq("invoice_id", invoice)).length,
    1,
  );
  unwrap(
    await a.client.rpc("record_government_payment", {
      org_id: orgA,
      payment_values: {
        invoice_id: invoice,
        received_date: "2026-02-15",
        amount_cents: 5500,
        kind: "progress",
      },
    }),
  );
  assert.equal(
    unwrap(await a.client.from("government_invoices").select("status").eq("id", invoice).single())
      .status,
    "paid",
  );
  assert(
    (
      await b.client.rpc("void_financial_record", {
        org_id: orgA,
        record_kind: "invoice",
        record_id: invoice,
        reason: "ATTACK",
      })
    ).error,
  );
});
await check("demo users cannot write or become staff", async () => {
  const demo = await actor();
  const demoOrg = unwrap(await admin.rpc("reset_demo", { demo_user_id: demo.id }));
  assert(
    (
      await demo.client.from("jobs").insert({
        organization_id: demoOrg,
        contract_number: "ATTACK",
        retainage_bps: 0,
        payment_terms_days: 14,
        status: "active",
      })
    ).error,
  );
  assert((await admin.rpc("provision_staff", { target_user: demo.id })).error);
});
await check("anonymous visitors have no table/RPC access", async () => {
  const anon = createClient<Database>(url, key, { auth: { persistSession: false } });
  assert((await anon.from("jobs").select()).error);
  assert((await anon.rpc("request_security_context")).error);
});
console.log(
  `${passed} hosted Data API checks passed. Fixtures are retained only in this dedicated test project.`,
);
