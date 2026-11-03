import { redirect } from "next/navigation";
import { context } from "@/lib/data/repository";
import { lookupUei } from "@/lib/usaspending";
import { userDataClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/server";
import { draftSchema, emptyDraft, preselectedAwards } from "@/lib/onboarding/model";
import { OnboardingFlow } from "@/components/product/onboarding-flow";
import { today } from "@/lib/finance";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; manual?: string; uei?: string }>;
}) {
  const user = await requireUser();
  const ctx = await context(),
    params = await searchParams;
  if (ctx.organization && params.done !== "1") redirect("/");
  if (params.done === "1" && !ctx.organization) redirect("/onboarding");
  if (params.done === "1")
    return <OnboardingFlow initial={emptyDraft(today())} asOf={today()} done />;
  const asOf = today(),
    client = await userDataClient();
  const { data, error } = await client
    .from("onboarding_drafts")
    .select("draft")
    .eq("user_id", user.id)
    .maybeSingle();
  const saved = draftSchema.safeParse(data?.draft);
  let draft = saved.success ? saved.data : emptyDraft(asOf);
  if (!saved.success && params.manual === "1") draft = { ...draft, manual: true, step: 1 };
  if (!saved.success && /^[A-Z0-9]{12}$/.test(params.uei ?? ""))
    draft = { ...draft, uei: params.uei!, step: 1 };
  const lookup =
    draft.uei && !draft.manual && params.done !== "1"
      ? await lookupUei(draft.uei, fetch, { includeOlder: draft.includeOlder })
      : null;
  if (lookup?.kind === "found" && !draft.name)
    draft = { ...draft, name: lookup.name, selected: preselectedAwards(lookup.awards, asOf) };
  const failed = lookup && lookup.kind !== "found";
  if (failed) draft = { ...draft, step: 0 };
  return (
    <OnboardingFlow
      initial={draft}
      initialLookup={lookup?.kind === "found" ? lookup : null}
      asOf={asOf}
      done={params.done === "1"}
      initialError={
        failed
          ? lookup.message
          : error
            ? "Saved progress could not be loaded. Please retry before continuing."
            : ""
      }
    />
  );
}
