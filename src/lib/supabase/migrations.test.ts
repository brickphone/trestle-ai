import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
let db: PGlite;
const a = randomUUID(),
  b = randomUUID(),
  staff = randomUUID(),
  demo = randomUUID();
let orgA: string, orgB: string, jobA: string, jobB: string;
const bundle = () => readFileSync("supabase/setup.sql", "utf8");
async function asUser<T>(
  id: string | null,
  role: "authenticated" | "anon" | "service_role",
  work: (tx: Transaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, role }),
    ]);
    return work(tx);
  });
}
async function createOrg(id: string, name: string) {
  return asUser(id, "authenticated", async (tx) => {
    const result = await tx.query<{ id: string }>(
      "select public.complete_onboarding($1,null,'manual','[]',0,current_date,null,500,14) as id",
      [name],
    );
    return result.rows[0]!.id;
  });
}
beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/build-migrations.mjs"], { stdio: "pipe" });
  db = await PGlite.create();
  // Only Supabase's managed Auth roles/helpers are stubbed. All application SQL is real.
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,encrypted_password text,phone text);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',current_user::text)$$;
 grant usage on schema auth to authenticated,anon,service_role;
 grant execute on function auth.uid(),auth.role() to authenticated,anon,service_role;`);
  await db.exec(bundle());
  for (const id of [a, b, staff, demo])
    await db.query("insert into auth.users(id,email,encrypted_password) values($1,$2,$3)", [
      id,
      `${id}@test.invalid`,
      "test-only",
    ]);
  orgA = await createOrg(a, "TEST A");
  orgB = await createOrg(b, "TEST B");
  for (const [user, org, reference] of [
    [a, orgA, "A"],
    [b, orgB, "B"],
  ]) {
    const result = await asUser(user!, "authenticated", (tx) =>
      tx.query<{ id: string }>(
        "insert into public.jobs(organization_id,contract_number,retainage_bps,payment_terms_days) values($1,$2,500,14) returning id",
        [org, reference],
      ),
    );
    if (user === a) jobA = result.rows[0]!.id;
    else jobB = result.rows[0]!.id;
  }
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("versioned migrations and real PostgreSQL RLS without Docker", () => {
  it("runs the SQL Editor bundle twice without losing data", async () => {
    await db.exec(bundle());
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(2);
  });
  it("has forced RLS on every application table and disables the old login", async () => {
    const result = await db.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    );
    expect(result.rows).toHaveLength(13);
    expect(result.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
    expect(
      (
        await db.query<{ rolcanlogin: boolean }>(
          "select rolcanlogin from pg_roles where rolname='app_runtime'",
        )
      ).rows[0]?.rolcanlogin,
    ).toBe(false);
  });
  it("unfiltered reads expose only the caller organization", async () => {
    const rows = await asUser(a, "authenticated", (tx) =>
      tx.query<{ id: string }>("select id from public.jobs"),
    );
    expect(rows.rows.map((r) => r.id)).toEqual([jobA]);
    const other = await asUser(a, "authenticated", (tx) =>
      tx.query("select id from public.jobs where id=$1", [jobB]),
    );
    expect(other.rows).toHaveLength(0);
  });
  it("denies cross-organization inserts and foreign-key links", async () => {
    await expect(
      asUser(a, "authenticated", (tx) =>
        tx.query(
          "insert into public.jobs(organization_id,contract_number,retainage_bps,payment_terms_days) values($1,'ATTACK',0,14)",
          [orgB],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      asUser(a, "authenticated", (tx) =>
        tx.query(
          "insert into public.change_orders(organization_id,job_id,reference,amount_cents,date,status) values($1,$2,'ATTACK',1,current_date,'pending')",
          [orgA, jobB],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });
  it("uses the actual invoker role for the bypass guard", async () => {
    const normal = await asUser(a, "authenticated", (tx) =>
      tx.query<{ context: { role: string; rls_active: boolean; user_id: string } }>(
        "select public.request_security_context() as context",
      ),
    );
    expect(normal.rows[0]?.context).toEqual({
      role: "authenticated",
      rls_active: true,
      user_id: a,
    });
    const bypass = await asUser(null, "service_role", (tx) =>
      tx.query<{ context: { role: string; rls_active: boolean } }>(
        "select public.request_security_context() as context",
      ),
    );
    expect(bypass.rows[0]?.context.role).toBe("service_role");
    expect(bypass.rows[0]?.context.rls_active).toBe(false);
  });
  it("rolls back all onboarding rows if any imported job is invalid", async () => {
    const user = randomUUID();
    await db.query("insert into auth.users(id) values($1)", [user]);
    await expect(
      asUser(user, "authenticated", (tx) =>
        tx.query(
          "select public.complete_onboarding('ROLLBACK',null,'manual',$1,0,current_date,null,500,14)",
          [
            JSON.stringify([
              {
                externalId: "bad",
                sourceUrl: "https://test.invalid",
                contractNumber: "BAD",
                contractValueCents: -1,
              },
            ]),
          ],
        ),
      ),
    ).rejects.toThrow();
    const result = await asUser(user, "authenticated", (tx) =>
      tx.query("select id from public.organizations"),
    );
    expect(result.rows).toHaveLength(0);
  });
  it("keeps staff read-only and administrative functions inaccessible to members", async () => {
    await asUser(null, "service_role", (tx) =>
      tx.query("select public.provision_staff($1)", [staff]),
    );
    const rows = await asUser(staff, "authenticated", (tx) =>
      tx.query("select id from public.jobs"),
    );
    expect(rows.rows).toHaveLength(2);
    const changed = await asUser(staff, "authenticated", (tx) =>
      tx.query("update public.jobs set description=$1 where id=$2 returning id", ["ATTACK", jobA]),
    );
    expect(changed.rows).toHaveLength(0);
    await expect(
      asUser(a, "authenticated", (tx) => tx.query("select public.provision_staff($1)", [a])),
    ).rejects.toThrow(/permission denied/);
  });
  it("records payments atomically and rejects overpayments without partial saves", async () => {
    const invoice = await asUser(a, "authenticated", (tx) =>
      tx.query<{ id: string }>("select public.save_government_invoice($1,null,$2) as id", [
        orgA,
        JSON.stringify({
          job_id: jobA,
          invoice_number: "PAY-1",
          period_start: "2026-01-01",
          period_end: "2026-01-31",
          billed_cents: 10000,
          retainage_cents: 500,
          submitted_date: "2026-02-01",
          portal: "IPP",
          status: "submitted",
        }),
      ]),
    );
    const id = invoice.rows[0]!.id;
    const pay = (amount: number) =>
      asUser(a, "authenticated", (tx) =>
        tx.query("select public.record_government_payment($1,$2)", [
          orgA,
          JSON.stringify({
            invoice_id: id,
            received_date: "2026-02-15",
            amount_cents: amount,
            kind: "progress",
          }),
        ]),
      );
    await pay(4000);
    await expect(pay(6000)).rejects.toThrow(/exceeds/);
    expect(
      (
        await asUser(a, "authenticated", (tx) =>
          tx.query("select id from public.government_payments where invoice_id=$1", [id]),
        )
      ).rows,
    ).toHaveLength(1);
    await pay(5500);
    expect(
      (
        await asUser(a, "authenticated", (tx) =>
          tx.query<{ status: string }>(
            "select status from public.government_invoices where id=$1",
            [id],
          ),
        )
      ).rows[0]?.status,
    ).toBe("paid");
    await asUser(a, "authenticated", (tx) =>
      tx.query(
        "select public.void_financial_record($1,'payment',id,'Correction') from public.government_payments where invoice_id=$2 and amount_cents=5500",
        [orgA, id],
      ),
    );
    expect(
      (
        await asUser(a, "authenticated", (tx) =>
          tx.query<{ status: string }>(
            "select status from public.government_invoices where id=$1",
            [id],
          ),
        )
      ).rows[0]?.status,
    ).toBe("accepted");
  });
  it("keeps before/after audit events append-only with the user actor", async () => {
    await asUser(a, "authenticated", (tx) =>
      tx.query("update public.jobs set description='Audited edit' where id=$1", [jobA]),
    );
    const result = await asUser(a, "authenticated", (tx) =>
      tx.query<{ actor_id: string; after_value: { description: string } }>(
        "select actor_id,after_value from public.audit_events where record_id=$1 and operation='UPDATE'",
        [jobA],
      ),
    );
    expect(result.rows.at(-1)?.actor_id).toBe(a);
    expect(result.rows.at(-1)?.after_value.description).toBe("Audited edit");
    await expect(
      asUser(a, "authenticated", (tx) => tx.query("delete from public.audit_events")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      db.query("update public.audit_events set operation='TAMPER' where record_id=$1", [jobA]),
    ).rejects.toThrow(/append-only/);
  });
  it("seeds and resets only the read-only demo and blocks demo credential changes", async () => {
    await asUser(null, "service_role", (tx) => tx.query("select public.reset_demo($1)", [demo]));
    await asUser(null, "service_role", (tx) => tx.query("select public.reset_demo($1)", [demo]));
    const orgs = await asUser(demo, "authenticated", (tx) =>
      tx.query("select id from public.organizations"),
    );
    expect(orgs.rows).toHaveLength(1);
    await expect(
      asUser(demo, "authenticated", (tx) =>
        tx.query(
          "insert into public.jobs(organization_id,contract_number,retainage_bps,payment_terms_days) select id,'ATTACK',0,14 from public.organizations",
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query("update auth.users set encrypted_password='changed' where id=$1", [demo]),
    ).rejects.toThrow(/managed administratively/);
  });
  it("denies anonymous table and function access", async () => {
    await expect(
      asUser(null, "anon", (tx) => tx.query("select id from public.jobs")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(null, "anon", (tx) => tx.query("select public.request_security_context()")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("onboarding award snapshots and cross-page imports", () => {
  it("atomically imports more than one old page, preserves raw flags and applies end-date status", async () => {
    const user = randomUUID();
    await db.query(
      "insert into auth.users(id,email,encrypted_password) values($1,$2,'test-only')",
      [user, `${user}@test.invalid`],
    );
    const awards = Array.from({ length: 21 }, (_, index) => ({
      externalId: `recorded-selection-${index}`,
      sourceUrl: "https://www.usaspending.gov/award/test",
      contractNumber: `Task order ${String(index).padStart(4, "0")} under TEST-IDV`,
      rawContractNumber: String(index).padStart(4, "0"),
      description: "IGF::OT::IGF Renovate clinic",
      displayDescription: "Renovate clinic",
      agency: "Test agency",
      contractValueCents: 100000,
      startDate: "2020-08-13",
      endDate: index === 20 ? null : index === 0 ? "2021-02-09" : "2099-01-01",
    }));
    await asUser(user, "authenticated", async (tx) => {
      const created = await tx.query<{ id: string }>(
        "select public.complete_onboarding('Recorded fixture',null,'usaspending',$1,0,current_date,null,500,14) as id",
        [JSON.stringify(awards)],
      );
      const org = created.rows[0]!.id;
      const jobs = await tx.query<{ description: string; status: string; contract_number: string }>(
        "select description,status,contract_number from public.jobs where organization_id=$1 order by contract_number",
        [org],
      );
      expect(jobs.rows).toHaveLength(21);
      expect(jobs.rows.every((j) => j.description === "Renovate clinic")).toBe(true);
      expect(jobs.rows[0]?.status).toBe("complete");
      expect(jobs.rows[1]?.status).toBe("active");
      expect(jobs.rows[20]?.status).toBe("planned");
      const snapshots = await tx.query<{
        original: { description: string; rawContractNumber: string };
      }>("select original from public.source_snapshots where organization_id=$1", [org]);
      expect(
        snapshots.rows.every((s) => s.original.description === "IGF::OT::IGF Renovate clinic"),
      ).toBe(true);
      expect(snapshots.rows.some((s) => s.original.rawContractNumber === "0011")).toBe(true);
    });
  });
});

describe("resumable onboarding drafts", () => {
  it("fails the request guard when draft RLS is disabled", async () => {
    await db.exec("alter table public.onboarding_drafts disable row level security");
    try {
      const result = await asUser(a, "authenticated", (tx) =>
        tx.query<{ context: { rls_active: boolean } }>(
          "select public.request_security_context() as context",
        ),
      );
      expect(result.rows[0]!.context.rls_active).toBe(false);
    } finally {
      await db.exec("alter table public.onboarding_drafts enable row level security");
    }
  });

  it("enforces identity for draft reads and writes, including direct queries", async () => {
    await asUser(a, "authenticated", (tx) =>
      tx.query("insert into public.onboarding_drafts(user_id,draft) values($1,$2)", [
        a,
        JSON.stringify({ step: 3, name: "Saved company" }),
      ]),
    );
    const own = await asUser(a, "authenticated", (tx) =>
      tx.query("select draft from public.onboarding_drafts"),
    );
    expect(own.rows).toHaveLength(1);
    expect(
      (await asUser(b, "authenticated", (tx) => tx.query("select * from public.onboarding_drafts")))
        .rows,
    ).toHaveLength(0);
    await expect(
      asUser(b, "authenticated", (tx) =>
        tx.query("insert into public.onboarding_drafts(user_id,draft) values($1,'{}')", [a]),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      (
        await asUser(b, "authenticated", (tx) =>
          tx.query(
            "update public.onboarding_drafts set draft='{}' where user_id=$1 returning user_id",
            [a],
          ),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(null, "anon", (tx) => tx.query("select * from public.onboarding_drafts")),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(staff, "authenticated", (tx) =>
        tx.query("insert into public.onboarding_drafts(user_id,draft) values($1,'{}')", [staff]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("atomically completes skipped assumptions and monthly costs and clears the draft", async () => {
    const user = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'draft@example.invalid')", [user]);
    await asUser(user, "authenticated", (tx) =>
      tx.query("insert into public.onboarding_drafts(user_id,draft) values($1,'{\"step\":4}')", [
        user,
      ]),
    );
    const result = await asUser(user, "authenticated", (tx) =>
      tx.query<{ id: string }>(
        "select public.complete_onboarding('Monthly test',null,'manual','[]',null,current_date,null,500,14,12345) as id",
      ),
    );
    const id = result.rows[0]!.id;
    expect(
      (await db.query("select * from public.onboarding_drafts where user_id=$1", [user])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from public.cash_balance_entries where organization_id=$1", [id]))
        .rows,
    ).toHaveLength(0);
    const costs = await db.query<{ frequency: string; amount_cents: number }>(
      "select frequency,amount_cents from public.recurring_costs where organization_id=$1",
      [id],
    );
    expect(costs.rows).toEqual([{ frequency: "monthly", amount_cents: 12345 }]);
  });
});

describe("job forecast inputs and overhead separation", () => {
  it("saves opening billed totals, lag, public obligations and office overhead atomically", async () => {
    const user = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'projection@example.invalid')", [
      user,
    ]);
    const award = {
      externalId: "projection-source",
      sourceUrl: "https://www.usaspending.gov/award/projection-source",
      contractNumber: "PROJECTION-1",
      description: "RAW CONTRACT DESCRIPTION",
      displayDescription: "RAW CONTRACT DESCRIPTION",
      contractValueCents: 900000000,
      obligationsCents: 120000000,
      startDate: "2026-01-01",
      endDate: "2030-06-30",
    };
    const result = await asUser(user, "authenticated", (tx) =>
      tx.query<{ id: string }>(
        "select public.complete_onboarding('Projection setup',null,'usaspending',$1,10000000,current_date,6000000,500,14,2000000,$2) as id",
        [
          JSON.stringify([award]),
          JSON.stringify([
            {
              externalId: "projection-source",
              billedCents: 25000000,
              paymentLagDays: 35,
              costRatioBps: 8500,
            },
          ]),
        ],
      ),
    );
    const org = result.rows[0]!.id;
    const jobs = await asUser(user, "authenticated", (tx) =>
      tx.query<{ id: string; obligated_cents: number }>(
        "select id,obligated_cents from public.jobs where organization_id=$1",
        [org],
      ),
    );
    expect(jobs.rows[0]!.obligated_cents).toBe(120000000);
    const assumptions = await asUser(user, "authenticated", (tx) =>
      tx.query<{
        billed_before_tracking_cents: number;
        payment_lag_days: number;
        cost_mode: string;
      }>(
        "select billed_before_tracking_cents,payment_lag_days,cost_mode from public.forecast_assumptions where organization_id=$1",
        [org],
      ),
    );
    expect(assumptions.rows).toEqual([
      { billed_before_tracking_cents: 25000000, payment_lag_days: 35, cost_mode: "modeled" },
    ]);
    const costs = await asUser(user, "authenticated", (tx) =>
      tx.query<{ cost_scope: string; label: string }>(
        "select cost_scope,label from public.recurring_costs where organization_id=$1 order by label",
        [org],
      ),
    );
    expect(costs.rows).toEqual([
      { cost_scope: "overhead", label: "Monthly overhead" },
      { cost_scope: "overhead", label: "Weekly office payroll" },
    ]);
    await asUser(user, "authenticated", (tx) =>
      tx.query("update public.jobs set contract_value_cents=60000000 where id=$1", [
        jobs.rows[0]!.id,
      ]),
    );
    const edited = await asUser(user, "authenticated", (tx) =>
      tx.query<{ value_override_cents: number }>(
        "select value_override_cents from public.forecast_assumptions where organization_id=$1",
        [org],
      ),
    );
    expect(edited.rows[0]!.value_override_cents).toBe(60000000);
    expect(
      (
        await db.query<{ original: unknown }>(
          "select original from public.source_snapshots where organization_id=$1",
          [org],
        )
      ).rows[0]!.original,
    ).toEqual(award);
    expect(
      (
        await asUser(b, "authenticated", (tx) =>
          tx.query(
            "update public.forecast_assumptions set payment_lag_days=0 where organization_id=$1 returning id",
            [org],
          ),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("leaves ambiguous legacy company payroll unclassified and enforces job links", async () => {
    const result = await asUser(a, "authenticated", (tx) =>
      tx.query<{ id: string; cost_scope: string }>(
        "insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date) values($1,'Weekly payroll estimate','payroll',100,'weekly',current_date) returning id,cost_scope",
        [orgA],
      ),
    );
    expect(result.rows[0]!.cost_scope).toBe("unclassified");
    await expect(
      asUser(a, "authenticated", (tx) =>
        tx.query("update public.recurring_costs set cost_scope='job' where id=$1", [
          result.rows[0]!.id,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
    await asUser(a, "authenticated", (tx) =>
      tx.query("update public.recurring_costs set cost_scope='overhead' where id=$1", [
        result.rows[0]!.id,
      ]),
    );
  });
});

describe("editing existing company setup", () => {
  it("updates in place, preserves ledger/source rows, ends old estimates, and is safe to retry", async () => {
    const owner = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'edit-owner@example.invalid')", [
      owner,
    ]);
    const org = await createOrg(owner, "Before edit");
    const today = (await db.query<{ day: string }>("select current_date::text as day")).rows[0]!
      .day;
    const source = (
      await asUser(owner, "authenticated", (tx) =>
        tx.query<{ id: string }>(
          "insert into public.source_snapshots(organization_id,external_id,source_url,original) values($1,'edit-source','https://www.usaspending.gov/award/edit-source','{\"raw\":\"SOURCE UNCHANGED\"}') returning id",
          [org],
        ),
      )
    ).rows[0]!.id;
    const job = (
      await asUser(owner, "authenticated", (tx) =>
        tx.query<{ id: string }>(
          "insert into public.jobs(organization_id,source_snapshot_id,contract_number,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days) values($1,$2,'EDIT-JOB',1000000,current_date,current_date+180,500,14) returning id",
          [org, source],
        ),
      )
    ).rows[0]!.id;
    const invoice = (
      await asUser(owner, "authenticated", (tx) =>
        tx.query<{ id: string }>(
          "insert into public.government_invoices(organization_id,job_id,invoice_number,period_start,period_end,billed_cents,retainage_cents,submitted_date,payment_terms_days,portal,status) values($1,$2,'KEEP-INVOICE',current_date,current_date,10000,0,current_date,14,'other','accepted') returning id",
          [org, job],
        ),
      )
    ).rows[0]!.id;
    await asUser(owner, "authenticated", async (tx) => {
      await tx.query(
        "insert into public.government_payments(organization_id,invoice_id,received_date,amount_cents,kind) values($1,$2,current_date,5000,'progress')",
        [org, invoice],
      );
      await tx.query(
        "insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date,created_at) values($1,100000,current_date-7,now()-interval '1 day')",
        [org],
      );
      await tx.query(
        "insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,billed_before_tracking_cents,billed_through_date) values($1,$2,false,9000,'front-loaded',6,30,40,'explicit',0,current_date-30)",
        [org, job],
      );
      await tx.query(
        "insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date,cost_scope) values($1,'Monthly overhead','other',9000,'monthly',current_date-10,'overhead'),($1,'Weekly office payroll','payroll',5000,'weekly',current_date,'overhead'),($1,'Unrelated insurance','other',1234,'monthly',current_date,'overhead')",
        [org],
      );
    });
    const preserved = async () =>
      Promise.all(
        ["jobs", "government_invoices", "government_payments", "source_snapshots"].map((table) =>
          db.query(`select * from public.${table} where organization_id=$1 order by id`, [org]),
        ),
      );
    const before = await preserved();
    const input = {
      name: "Edited company",
      uei: "",
      jobs: [{ id: job, billedCents: 250000, paymentLagDays: 45 }],
      openingBalanceCents: 200000,
      balanceDate: today,
      monthlyCents: 20000,
      payrollCents: 0,
      defaultCostRatioBps: 8500,
    };
    const apply = () =>
      asUser(owner, "authenticated", (tx) =>
        tx.query("select public.update_company_setup($1,$2)", [org, JSON.stringify(input)]),
      );
    await apply();
    expect(await preserved()).toEqual(before);
    expect(
      (await db.query<{ name: string }>("select name from public.organizations where id=$1", [org]))
        .rows[0]!.name,
    ).toBe("Edited company");
    const assumptions = await db.query<{
      enabled: boolean;
      cost_ratio_bps: number;
      cost_profile: string;
      payment_lag_days: number;
      billed_before_tracking_cents: number;
    }>(
      "select enabled,cost_ratio_bps,cost_profile,payment_lag_days,billed_before_tracking_cents from public.forecast_assumptions where organization_id=$1",
      [org],
    );
    expect(assumptions.rows).toEqual([
      {
        enabled: false,
        cost_ratio_bps: 9000,
        cost_profile: "front-loaded",
        payment_lag_days: 45,
        billed_before_tracking_cents: 250000,
      },
    ]);
    const activeCosts = await db.query<{ label: string; amount_cents: number }>(
      "select label,amount_cents from public.recurring_costs where organization_id=$1 and voided_at is null and (end_date is null or end_date>=current_date) order by label",
      [org],
    );
    expect(activeCosts.rows).toEqual([
      { label: "Monthly overhead", amount_cents: 20000 },
      { label: "Unrelated insurance", amount_cents: 1234 },
    ]);
    const firstBalanceCount = (
      await db.query("select * from public.cash_balance_entries where organization_id=$1", [org])
    ).rows.length;
    expect(firstBalanceCount).toBe(3);
    await apply();
    expect(
      (await db.query("select * from public.cash_balance_entries where organization_id=$1", [org]))
        .rows,
    ).toHaveLength(firstBalanceCount);
    expect(
      (await db.query("select * from public.recurring_costs where organization_id=$1", [org])).rows,
    ).toHaveLength(4);
    expect(
      (
        await db.query(
          "select * from public.audit_events where organization_id=$1 and actor_id=$2",
          [org, owner],
        )
      ).rows.length,
    ).toBeGreaterThan(0);
    await expect(
      asUser(owner, "authenticated", (tx) =>
        tx.query("select public.update_company_setup($1,$2)", [
          org,
          JSON.stringify({
            ...input,
            name: "Should roll back",
            jobs: [{ id: jobB, billedCents: 0, paymentLagDays: 0 }],
          }),
        ]),
      ),
    ).rejects.toThrow(/does not belong/);
    expect(
      (await db.query<{ name: string }>("select name from public.organizations where id=$1", [org]))
        .rows[0]!.name,
    ).toBe("Edited company");
    for (const user of [b, staff, demo])
      await expect(
        asUser(user, "authenticated", (tx) =>
          tx.query("select public.update_company_setup($1,$2)", [org, JSON.stringify(input)]),
        ),
      ).rejects.toThrow(/Read-only/);
    await expect(
      asUser(null, "anon", (tx) =>
        tx.query("select public.update_company_setup($1,$2)", [org, JSON.stringify(input)]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

it("edits tracking and billing atomically while preserving job financial history and enforcing owner tenancy", async () => {
  const owner = randomUUID();
  await db.query("insert into auth.users(id)values($1)", [owner]);
  const org = await createOrg(owner, "Contract editor test");
  const job = (
    await asUser(owner, "authenticated", (tx) =>
      tx.query<{ id: string }>(
        "insert into public.jobs(organization_id,contract_number,retainage_bps,payment_terms_days,status,start_date,end_date)values($1,'MISSING',500,30,'active',current_date-30,current_date+90)returning id",
        [org],
      ),
    )
  ).rows[0]!.id;
  const apply = (values: unknown, user = owner) =>
    asUser(user, "authenticated", (tx) =>
      tx.query("select public.update_contracts($1,$2)", [org, JSON.stringify(values)]),
    );
  const entry = {
    id: job,
    tracked: true,
    billedCents: 100000,
    paymentLagDays: 45,
    billedSource: "schedule",
  };
  await expect(apply([entry])).rejects.toThrow(/missing contract value/);
  await apply([{ ...entry, contractValueCents: 1000000 }]);
  await asUser(owner, "authenticated", (tx) =>
    tx.query(
      "update public.forecast_assumptions set cost_ratio_bps=9000,cost_profile='front-loaded' where job_id=$1",
      [job],
    ),
  );
  const snapshot = await db.query(
    "select * from public.source_snapshots where organization_id=$1",
    [org],
  );
  const bank = await db.query(
    "select * from public.cash_balance_entries where organization_id=$1",
    [org],
  );
  await apply([{ id: job, tracked: false }]);
  expect(
    (
      await db.query<{ is_tracked: boolean; voided_at: null }>(
        "select is_tracked,voided_at from public.jobs where id=$1",
        [job],
      )
    ).rows,
  ).toEqual([{ is_tracked: false, voided_at: null }]);
  await apply([{ ...entry, billedSource: "manual", billedCents: 200000 }]);
  expect(
    (
      await db.query(
        "select cost_ratio_bps,cost_profile,payment_lag_days,billed_source,billed_before_tracking_cents from public.forecast_assumptions where job_id=$1",
        [job],
      )
    ).rows,
  ).toEqual([
    {
      cost_ratio_bps: 9000,
      cost_profile: "front-loaded",
      payment_lag_days: 45,
      billed_source: "manual",
      billed_before_tracking_cents: 200000,
    },
  ]);
  expect(
    await db.query("select * from public.source_snapshots where organization_id=$1", [org]),
  ).toEqual(snapshot);
  expect(
    await db.query("select * from public.cash_balance_entries where organization_id=$1", [org]),
  ).toEqual(bank);
  await expect(apply([{ ...entry, id: jobB }])).rejects.toThrow(/Job not available/);
  for (const user of [b, staff, demo]) await expect(apply([entry], user)).rejects.toThrow(/owner/);
  await expect(
    asUser(null, "anon", (tx) => tx.query("select public.update_contracts($1,'[]')", [org])),
  ).rejects.toThrow(/permission denied/);
});
