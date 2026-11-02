import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
export function adminDb() {
  if (!process.env.DATABASE_ADMIN_URL)
    throw new Error("Set DATABASE_ADMIN_URL for this administrative command.");
  return postgres(process.env.DATABASE_ADMIN_URL, { prepare: false, max: 1, connect_timeout: 10 });
}
export function adminAuth() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Set the Supabase URL and server-only SUPABASE_SECRET_KEY.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function ensureUser(email, password) {
  const admin = adminAuth();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (data.user) return data.user;
  if (
    error?.code !== "email_exists" &&
    error?.code !== "email_address_exists" &&
    !error?.message.includes("already")
  )
    throw error;
  for (let page = 1; page <= 100; page++) {
    const { data: users, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (listError) throw listError;
    const user = users.users.find((u) => u.email === email);
    if (user) return user;
    if (users.users.length < 100) break;
  }
  throw new Error("Existing user could not be located.");
}
