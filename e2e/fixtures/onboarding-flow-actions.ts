/** Browser test transport only. Production uses authenticated server actions and RLS. */
import { lookupUei } from "@/lib/usaspending";
import { recordedFetcher } from "@/lib/usaspending/fixtures/replay";
import type { OnboardingDraft } from "@/lib/onboarding/model";
export async function saveOnboardingDraft(draft: OnboardingDraft) {
  localStorage.setItem("onboarding-test-draft", JSON.stringify(draft));
  return { success: true };
}
export async function findOnboardingCompany(uei: string, includeOlder = false) {
  if (location.search.includes("lookup-loading"))
    await new Promise((resolve) => setTimeout(resolve, 300));
  if (location.search.includes("lookup-error"))
    return { kind: "error" as const, message: "USAspending unavailable. Continue manually." };
  return lookupUei(uei, recordedFetcher(), { asOfDate: "2021-03-01", includeOlder });
}
