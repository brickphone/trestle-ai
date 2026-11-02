import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Set DATABASE_URL in .env.local; see README.md.");
}
const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10 });
try {
  const db = drizzle(client);
  const [result] = await db.execute(sql`
    select exists(select 1 from pg_namespace where nspname = 'app') as schema_exists,
      has_schema_privilege('anon', 'app', 'usage') as anon_access,
      has_schema_privilege('authenticated', 'app', 'usage') as authenticated_access,
      exists(select 1 from supabase_migrations.schema_migrations
        where version = '20261102000000') as migration_applied
  `);
  assert.equal(result.schema_exists, true);
  assert.equal(result.migration_applied, true);
  assert.equal(result.anon_access, false);
  assert.equal(result.authenticated_access, false);
  console.log("Database connection, baseline migration and schema permissions verified.");
} finally {
  await client.end();
}
