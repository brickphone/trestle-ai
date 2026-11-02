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
    expect(result.rows).toHaveLength(12);
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
