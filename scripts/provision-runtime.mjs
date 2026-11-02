import { adminDb } from "./lib/admin.mjs";
const target = new URL(process.env.DATABASE_URL ?? "");
if (!/^app_runtime(?:\.[a-z0-9]+)?$/.test(target.username) || !target.password)
  throw new Error("DATABASE_URL must use app_runtime and a strong password.");
const client = adminDb();
try {
  await client.begin(async (tx) => {
    await tx`select set_config('app.runtime_password',${decodeURIComponent(target.password)},true)`;
    await tx`do $$ begin execute format('alter role app_runtime password %L', current_setting('app.runtime_password')); end $$`;
  });
  console.log("Restricted runtime login configured.");
} finally {
  await client.end();
}
