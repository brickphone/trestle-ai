/** Test-only browser entry: mount the actual interactive chart with fixture props. */
import { createRoot } from "react-dom/client";
import { CashChart } from "@/components/product/cash-chart";
import { forecast } from "@/lib/forecast";
import { demo, projectedDemo } from "@/components/product/tests/fixtures";

const result = location.pathname.includes("projected")
  ? forecast(projectedDemo, "2026-01-01")
  : forecast(demo, "2026-11-02");
for (const figure of document.querySelectorAll("[data-cash-chart]")) {
  const host = document.createElement("div");
  host.dataset.chartMounted = "true";
  figure.replaceWith(host);
  createRoot(host).render(
    <CashChart
      result={result}
      sourcePrefix={location.pathname.includes("forecast") ? "" : "/forecast"}
    />,
  );
}

for (const element of document.querySelectorAll("[data-account-menu]")) {
  const { AccountMenu } = await import("@/components/product/account-menu");
  const host = document.createElement("div");
  element.replaceWith(host);
  createRoot(host).render(
    <AccountMenu
      email="founder@example.test"
      signOutAction={async () => {
        document.documentElement.dataset.signedOut = "true";
      }}
    />,
  );
}

if (document.querySelector("[data-onboarding-flow]")) {
  const { OnboardingFlow } = await import("@/components/product/onboarding-flow");
  const { emptyDraft, preselectedAwards } = await import("@/lib/onboarding/model");
  const { lookupUei } = await import("@/lib/usaspending");
  const { recordedFetcher, recordedUei } = await import("@/lib/usaspending/fixtures/replay");
  const asOf = location.pathname.includes("no-active") ? "2026-11-03" : "2021-03-01";
  const found = await lookupUei(recordedUei, recordedFetcher(), { asOfDate: asOf });
  if (found.kind !== "found") throw Error("Fixture failed");
  const match = location.pathname.match(/step-(\d+)/);
  const step = match
    ? Math.min(4, Number(match[1]) - 1)
    : location.pathname.includes("awards") || location.pathname.includes("no-active")
      ? 2
      : location.pathname.includes("manual")
        ? 1
        : 0;
  const base = {
    ...emptyDraft(asOf),
    step,
    manual: location.pathname.includes("manual"),
    uei: step ? recordedUei : "",
    name: step ? found.name : "",
    selected: preselectedAwards(found.awards, asOf),
  };
  const saved = localStorage.getItem("onboarding-test-draft");
  const initial = saved ? JSON.parse(saved) : base;
  const host = document.createElement("div");
  host.dataset.flowMounted = "true";
  document.querySelector("[data-onboarding-flow]")!.closest(".onboarding-frame")!.replaceWith(host);
  createRoot(host).render(
    <OnboardingFlow
      initial={initial}
      initialLookup={found}
      asOf={asOf}
      done={match?.[1] === "6"}
    />,
  );
}

document.documentElement.dataset.visualClient = "ready";
