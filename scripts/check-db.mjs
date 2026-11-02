import assert from "node:assert/strict";
import postgres from "postgres";
if (!process.env.DATABASE_URL) throw new Error("Set the restricted DATABASE_URL in .env.local.");
const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10 });
try {
  await client.begin(async (tx) => {
    const [login] =
      await tx`select current_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user`;
    assert.equal(login.current_user, "app_runtime");
    assert.equal(login.rolsuper, false);
    assert.equal(login.rolbypassrls, false);
    await tx`set local role app_request`;
    const [guard] =
      await tx`select row_security_active('app.jobs'::regclass) as jobs,row_security_active('app.organizations'::regclass) as orgs`;
    assert.equal(guard.jobs, true);
    assert.equal(guard.orgs, true);
    const rows = await tx`select id from app.jobs`;
    assert.equal(rows.length, 0, "No identity must mean no rows");
  });
  console.log("Restricted runtime connection and active RLS verified.");
} finally {
  await client.end();
}
