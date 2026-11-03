/** Test-only browser entry: mount the actual interactive chart with fixture props. */
import { createRoot } from "react-dom/client";
import { CashChart } from "@/components/product/cash-chart";
import { forecast } from "@/lib/forecast";
import { demo } from "@/components/product/tests/fixtures";

const result = forecast(demo, "2026-11-02");
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
document.documentElement.dataset.visualClient = "ready";
