import { spawnSync } from "node:child_process";
if (!process.env.DATABASE_ADMIN_URL)
  throw new Error("Set DATABASE_ADMIN_URL for hosted migrations. See README.md.");
const target = new URL(process.env.DATABASE_ADMIN_URL);
if (["localhost", "127.0.0.1", "::1"].includes(target.hostname))
  throw new Error("This workflow targets hosted Supabase only.");
const result = spawnSync(
  "node_modules/.bin/supabase",
  ["db", "push", "--db-url", process.env.DATABASE_ADMIN_URL],
  { stdio: "inherit", env: process.env },
);
if (result.error) throw new Error("Unable to run the Supabase CLI.");
process.exitCode = result.status ?? 1;
