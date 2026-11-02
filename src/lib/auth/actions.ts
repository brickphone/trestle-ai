"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authClient } from "./server";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "../env";
import type { ActionResult } from "@/components/product/action-form";
import { createRuntime } from "../db/session";
import { getDatabaseEnv } from "../server-env";
import { eq } from "drizzle-orm";
import { memberships, organizations, staffUsers } from "../db/schema";
const email = z.email();
function siteUrl() {
  return z.url().parse(process.env.SITE_URL ?? "http://localhost:3000");
}
async function availableAuth() {
  try {
    return await authClient();
  } catch {
    return null;
  }
}
export async function login(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const client = await availableAuth();
  if (!client) return { error: "Sign-in is temporarily unavailable." };
  const { error } = await client.auth.signInWithPassword({
    email: parsed.data,
    password: String(form.get("password") ?? ""),
  });
  if (error) return { error: "Unable to sign in. Check your email and password." };
  redirect("/");
}
export async function signup(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ email, password: z.string().min(12).max(128) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid email and a password of 12–128 characters." };
  const client = await availableAuth();
  if (!client) return { error: "Sign-up is temporarily unavailable." };
  const { data, error } = await client.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: "Unable to create an account. Please try again or sign in." };
  if (data.session) redirect("/onboarding");
  return { success: "Check your email to confirm your account, then sign in." };
}
export async function magicLink(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Enter a valid email address." };
  const client = await availableAuth();
  if (!client) return { error: "Sign-in is temporarily unavailable." };
  const { error } = await client.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return { error: "Unable to send a link right now. Please try again." };
  return { success: "If this account exists, a sign-in link has been sent." };
}
export async function signout() {
  const client = await authClient();
  await client.auth.signOut();
  redirect("/login");
}
export async function viewDemo(): Promise<void> {
  const email = process.env.DEMO_EMAIL,
    password = process.env.DEMO_PASSWORD;
  if (!email || !password) redirect("/login?message=Demo%20is%20temporarily%20unavailable.");
  const env = getPublicEnv();
  // Validate the dedicated identity before installing any cookies. A misconfigured
  // demo must never sign a visitor into a real/staff account, even on a DB error.
  const isolated = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await isolated.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session)
    redirect("/login?message=Demo%20is%20temporarily%20unavailable.");
  const runtime = createRuntime(getDatabaseEnv().DATABASE_URL);
  let safe = false;
  try {
    safe = await runtime.run(data.user.id, async (tx) => {
      const staff = await tx.select().from(staffUsers);
      if (staff.length) return false;
      const rows = await tx
        .select({ demo: organizations.is_demo })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organization_id))
        .where(eq(memberships.user_id, data.user.id));
      return rows.length === 1 && rows[0]?.demo === true;
    });
  } finally {
    await runtime.close();
  }
  if (!safe) redirect("/login?message=Demo%20configuration%20requires%20attention.");
  const client = await authClient();
  const { error: sessionError } = await client.auth.setSession(data.session);
  if (sessionError) redirect("/login?message=Demo%20is%20temporarily%20unavailable.");
  redirect("/");
}
