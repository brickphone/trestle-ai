import type { ActionResult } from "@/components/product/action-form";
/** Captures the exact financial inputs sent to the real server action, without hosted writes. */
export async function finishOnboarding(_: ActionResult, form: FormData): Promise<ActionResult> {
  if (location.search.includes("finish-error"))
    return {
      error:
        "Database setup needs updating. Run the current supabase/setup.sql in Supabase SQL Editor, then try again. Your saved progress is kept.",
    };
  localStorage.setItem(
    "onboarding-test-submission",
    JSON.stringify({ ...Object.fromEntries(form), awards: form.getAll("award") }),
  );
  localStorage.removeItem("onboarding-test-draft");
  return { success: "Saved." };
}
