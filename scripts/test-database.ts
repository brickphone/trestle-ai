import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { and, eq, sql } from "drizzle-orm";
import { createRuntime } from "../src/lib/db/session";
import * as s from "../src/lib/db/schema";
if (process.env.ALLOW_DATABASE_TESTS !== "true")
  throw new Error("Set ALLOW_DATABASE_TESTS=true only for a dedicated hosted TEST project.");
if (!process.env.DATABASE_ADMIN_URL || !process.env.DATABASE_URL)
  throw new Error("Configure hosted admin and restricted runtime URLs.");
const admin = postgres(process.env.DATABASE_ADMIN_URL, { prepare: false, max: 1 });
const runtime = createRuntime(process.env.DATABASE_URL);
const ownerConnection = createRuntime(process.env.DATABASE_ADMIN_URL);
const ids = {
  a: randomUUID(),
  b: randomUUID(),
  staff: randomUUID(),
  demo: randomUUID(),
  orgA: randomUUID(),
  orgB: randomUUID(),
  jobA: randomUUID(),
  jobB: randomUUID(),
  invoice: randomUUID(),
};
let passed = 0;
async function check(name: string, test: () => Promise<void>) {
  await test();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  await admin.begin(async (tx) => {
    for (const user of [ids.a, ids.b, ids.staff, ids.demo])
      await tx`insert into auth.users(id,email) values(${user},${`rls-${user}@example.invalid`})`;
    await tx`insert into app.organizations(id,name) values(${ids.orgA},'RLS TEST A'),(${ids.orgB},'RLS TEST B')`;
    await tx`insert into app.memberships(organization_id,user_id,role) values(${ids.orgA},${ids.a},'owner'),(${ids.orgB},${ids.b},'owner')`;
    await tx`insert into app.staff_users(user_id) values(${ids.staff})`;
    await tx`insert into app.jobs(id,organization_id,contract_number,retainage_bps,payment_terms_days) values(${ids.jobA},${ids.orgA},'RLS TEST A',0,14),(${ids.jobB},${ids.orgB},'RLS TEST B',0,14)`;
  });
  await check("request wrapper fails closed on owner/bypass connection", async () => {
    await assert.rejects(
      () => ownerConnection.run(ids.a, (tx) => tx.select().from(s.jobs)),
      /Unsafe database connection/,
    );
  });
  await check("ordinary request really runs under RLS", async () => {
    await runtime.run(ids.a, async (tx) => {
      const [guard] = await tx.execute<{ role: string; login: string; active: boolean }>(
        sql`select current_user as role,session_user as login,row_security_active('app.jobs'::regclass) as active`,
      );
      assert.equal(guard?.role, "app_request");
      assert.equal(guard?.login, "app_runtime");
      assert.equal(guard?.active, true);
    });
  });
  await check("unfiltered selects cannot see org B", async () => {
    const rows = await runtime.run(ids.a, (tx) => tx.select().from(s.jobs));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.organization_id, ids.orgA);
  });
  await check("org A cannot directly select/update org B", async () => {
    assert.equal(
      (await runtime.run(ids.a, (tx) => tx.select().from(s.jobs).where(eq(s.jobs.id, ids.jobB))))
        .length,
      0,
    );
    assert.equal(
      (
        await runtime.run(ids.a, (tx) =>
          tx
            .update(s.jobs)
            .set({ description: "ATTACK" })
            .where(eq(s.jobs.id, ids.jobB))
            .returning(),
        )
      ).length,
      0,
    );
  });
  await check("cross-tenant inserts and composite links fail", async () => {
    await assert.rejects(() =>
      runtime.run(ids.a, (tx) =>
        tx.insert(s.jobs).values({
          organization_id: ids.orgB,
          contract_number: "ATTACK",
          retainage_bps: 0,
          payment_terms_days: 14,
          status: "active",
        }),
      ),
    );
    await assert.rejects(() =>
      runtime.run(ids.a, (tx) =>
        tx.insert(s.changeOrders).values({
          organization_id: ids.orgA,
          job_id: ids.jobB,
          reference: "ATTACK",
          amount_cents: 1,
          date: "2026-01-01",
          status: "pending",
        }),
      ),
    );
  });
  await check("staff sees both organizations but cannot write either", async () => {
    const rows = await runtime.run(ids.staff, (tx) => tx.select().from(s.jobs));
    assert(rows.some((r) => r.id === ids.jobA) && rows.some((r) => r.id === ids.jobB));
    assert.equal(
      (
        await runtime.run(ids.staff, (tx) =>
          tx
            .update(s.jobs)
            .set({ description: "ATTACK" })
            .where(eq(s.jobs.id, ids.jobA))
            .returning(),
        )
      ).length,
      0,
    );
    await assert.rejects(() =>
      runtime.run(ids.staff, (tx) =>
        tx.insert(s.jobs).values({
          organization_id: ids.orgA,
          contract_number: "STAFF ATTACK",
          retainage_bps: 0,
          payment_terms_days: 14,
          status: "active",
        }),
      ),
    );
  });
  await check("no identity and previous pooled identities cannot leak data", async () => {
    assert.equal((await runtime.run(randomUUID(), (tx) => tx.select().from(s.jobs))).length, 0);
    const b = await runtime.run(ids.b, (tx) => tx.select().from(s.jobs));
    assert.equal(b.length, 1);
    assert.equal(b[0]?.id, ids.jobB);
  });
  await check("runtime cannot elevate its role or grant staff", async () => {
    await assert.rejects(() =>
      runtime.run(ids.a, (tx) => tx.execute(sql`set local role postgres`)),
    );
    await assert.rejects(() =>
      runtime.run(ids.a, (tx) => tx.insert(s.staffUsers).values({ user_id: ids.a })),
    );
  });
  await check("financial updates have append-only before/after audit events", async () => {
    await runtime.run(ids.a, (tx) =>
      tx.update(s.jobs).set({ description: "Audited edit" }).where(eq(s.jobs.id, ids.jobA)),
    );
    const rows = await runtime.run(ids.a, (tx) =>
      tx
        .select()
        .from(s.auditEvents)
        .where(and(eq(s.auditEvents.record_id, ids.jobA), eq(s.auditEvents.operation, "UPDATE"))),
    );
    assert.equal(rows[0]?.actor_id, ids.a);
    assert.equal((rows[0]?.after_value as { description: string }).description, "Audited edit");
    await assert.rejects(() => runtime.run(ids.a, (tx) => tx.delete(s.auditEvents)));
    await assert.rejects(
      () => admin`update app.audit_events set operation='TAMPER' where record_id=${ids.jobA}`,
    );
  });
  await check(
    "partial payments cannot exceed net due, and full payment drives paid state",
    async () => {
      await runtime.run(ids.a, (tx) =>
        tx.insert(s.governmentInvoices).values({
          id: ids.invoice,
          organization_id: ids.orgA,
          job_id: ids.jobA,
          invoice_number: "RLS TEST",
          period_start: "2026-01-01",
          period_end: "2026-01-31",
          billed_cents: 10000,
          retainage_cents: 500,
          submitted_date: "2026-02-01",
          payment_terms_days: 14,
          portal: "IPP",
          status: "submitted",
        }),
      );
      await runtime.run(ids.a, (tx) =>
        tx.insert(s.governmentPayments).values({
          organization_id: ids.orgA,
          invoice_id: ids.invoice,
          received_date: "2026-02-15",
          amount_cents: 4000,
          kind: "progress",
        }),
      );
      await assert.rejects(() =>
        runtime.run(ids.a, (tx) =>
          tx.insert(s.governmentPayments).values({
            organization_id: ids.orgA,
            invoice_id: ids.invoice,
            received_date: "2026-02-15",
            amount_cents: 6000,
            kind: "progress",
          }),
        ),
      );
      await assert.rejects(() =>
        runtime.run(ids.a, (tx) =>
          tx
            .update(s.governmentInvoices)
            .set({ status: "paid" })
            .where(eq(s.governmentInvoices.id, ids.invoice)),
        ),
      );
      await runtime.run(ids.a, async (tx) => {
        await tx.insert(s.governmentPayments).values({
          organization_id: ids.orgA,
          invoice_id: ids.invoice,
          received_date: "2026-02-15",
          amount_cents: 5500,
          kind: "progress",
        });
        await tx
          .update(s.governmentInvoices)
          .set({ status: "paid" })
          .where(eq(s.governmentInvoices.id, ids.invoice));
      });
    },
  );
  await check("demo RLS denies all financial writes", async () => {
    const [demo] = await admin`select id from app.organizations where is_demo`;
    assert(demo, "Run demo:reset before database tests.");
    await admin`insert into app.memberships(organization_id,user_id,role) values(${demo.id},${ids.demo},'member')`;
    await assert.rejects(() =>
      runtime.run(ids.demo, (tx) =>
        tx.insert(s.jobs).values({
          organization_id: demo.id,
          contract_number: "ATTACK",
          retainage_bps: 0,
          payment_terms_days: 14,
          status: "active",
        }),
      ),
    );
    const rows = await runtime.run(ids.demo, (tx) => tx.select().from(s.organizations));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.is_demo, true);
  });
  await check("every application table has forced RLS and no anonymous policies", async () => {
    const tables =
      await admin`select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='app' and relkind='r'`;
    assert(tables.length >= 12);
    for (const t of tables) {
      assert(t.relrowsecurity, t.relname);
      assert(t.relforcerowsecurity, t.relname);
    }
    const anon =
      await admin`select * from pg_policies where schemaname='app' and ('anon'=any(roles) or 'public'=any(roles))`;
    assert.equal(anon.length, 0);
  });
  console.log(
    `${passed} database security checks passed. Test fixtures are retained in this dedicated test project.`,
  );
} finally {
  await runtime.close();
  await ownerConnection.close();
  await admin.end();
}
