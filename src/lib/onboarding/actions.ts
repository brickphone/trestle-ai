"use server";
import { context } from "@/lib/data/repository";
import { requireUser } from "@/lib/auth/server";
import { userDataClient } from "@/lib/supabase/server";
import { toJson } from "@/lib/supabase/database.types";
import { draftSchema, type OnboardingDraft } from "./model";
import { lookupUei } from "@/lib/usaspending";
export async function saveOnboardingDraft(value: OnboardingDraft) {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return { error: "Check your entries before continuing." };
  if (parsed.data.editingOrganizationId) {
    const ctx = await context();
    if (ctx.readOnly || !ctx.isOwner || ctx.organization?.id !== parsed.data.editingOrganizationId)
      return { error: "This account cannot edit this company’s setup." };
  }
  const client = await userDataClient();
  const { error } = await client
    .from("onboarding_drafts")
    .upsert({ user_id: user.id, draft: toJson(parsed.data) });
  return error ? { error: "Progress could not be saved. Try again." } : { success: true };
}
export async function findOnboardingCompany(uei: string, includeOlder = false) {
  await requireUser();
  return lookupUei(uei, fetch, { includeOlder: includeOlder === true });
}
