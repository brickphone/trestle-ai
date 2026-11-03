"use server";
import { requireUser } from "@/lib/auth/server";
import { lookupUei } from ".";
export async function loadOlderAwards(uei: string) {
  await requireUser();
  return lookupUei(uei, fetch, { includeOlder: true });
}
