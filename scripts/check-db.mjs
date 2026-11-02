import { createClient } from "@supabase/supabase-js";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  throw new Error("Set the hosted Supabase URL and publishable key.");
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const { error } = await client.from("jobs").select("id").limit(1);
if (!error) throw new Error("Anonymous database reads are unexpectedly allowed.");
if (error.code === "PGRST205" || error.code === "42P01") {
  console.error(
    "Database schema is not installed yet. Run npm run db:sql and execute supabase/setup.sql in the Supabase SQL Editor.",
  );
  process.exitCode = 1;
} else if (error.code === "42501")
  console.log(
    "Hosted Data API is reachable; anonymous table access is denied. Run test:db for authenticated RLS and bypass checks.",
  );
else {
  console.error("Hosted Data API check failed:", error.code ?? "HTTP_ERROR");
  process.exitCode = 1;
}
