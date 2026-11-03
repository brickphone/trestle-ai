import { it, expect } from "vitest";
import {
  scheduleBilledEstimate,
  sentenceDescription,
  defaultContractInput,
  validContractInput,
} from "./model";
import { companySetupSeed } from "./editing";
import { forecast } from "../forecast";
import { demo } from "@/components/product/tests/fixtures";
import { jobObligations } from "../job-values";
it("estimates elapsed schedule to nearest $1,000, and only defaults zero before start", () => {
  expect(scheduleBilledEstimate(120000000, "2026-01-01", "2027-01-01", "2026-07-02")).toBe(
    59800000,
  );
  expect(scheduleBilledEstimate(120000000, "2026-01-01", "2027-01-01", "2025-12-01")).toBe(0);
  expect(scheduleBilledEstimate(120000000, "2026-01-01", "2027-01-01", "2028-01-01")).toBe(
    120000000,
  );
  expect(scheduleBilledEstimate(null, "2026-01-01", "2027-01-01", "2026-07-01")).toBeNull();
  expect(scheduleBilledEstimate(100000, "2026-01-01", "2027-01-01", "2026-01-02")).toBeNull();
});
it("preserves installation identifiers and military acronyms in sentence display", () => {
  expect(sentenceDescription("NAWS0423-MILCON REPAIR MILCON ROADS")).toBe(
    "NAWS0423-MILCON repair MILCON roads",
  );
  expect(sentenceDescription("NAVFAC MCB AFB USACE VA")).toBe("NAVFAC MCB AFB USACE VA");
});
it("recovers legacy task-order obligations only from its own immutable snapshot, preserving explicit zero", () => {
  const job = { ...demo.jobs[0]!, obligated_cents: null, source_snapshot_id: "source" };
  const source = {
    id: "source",
    organization_id: job.organization_id,
    original: { obligationsCents: 337700000 },
    external_id: "award",
    source_url: "https://www.usaspending.gov/award/award",
    fetched_at: new Date(),
  };
  const before = JSON.stringify(source);
  expect(jobObligations(job, source)).toBe(337700000);
  expect(jobObligations({ ...job, obligated_cents: 0 }, source)).toBe(0);
  expect(jobObligations(job, { ...source, organization_id: "different" })).toBeNull();
  const seed = companySetupSeed({ ...demo, jobs: [job], snapshots: [source] }, "2026-11-03");
  expect(seed.result.awards[0]!.obligationsCents).toBe(337700000);
  expect(JSON.stringify(source)).toBe(before);
});
it("requires missing values, reports one missing-value warning, and excludes untracked projections", () => {
  const data = {
    ...demo,
    invoices: [],
    payments: [],
    assumptions: [],
    jobs: [
      {
        ...demo.jobs[0]!,
        status: "active",
        contract_value_cents: null,
        obligated_cents: null,
        source_snapshot_id: null,
      },
    ],
  };
  const seed = companySetupSeed(data, "2026-11-03"),
    award = seed.result.awards[0]!;
  expect(validContractInput(award, defaultContractInput(award, "2026-11-03"))).toBe(false);
  expect(validContractInput(award, { billed: "0", lag: "30", value: "100000" })).toBe(true);
  expect(
    forecast(data, "2026-11-03").issues.filter((i) => i.label === "1 job has no contract value"),
  ).toHaveLength(1);
  const result = forecast(
    { ...data, jobs: [{ ...data.jobs[0]!, is_tracked: false, contract_value_cents: 100000000 }] },
    "2026-11-03",
  );
  expect(result.sources.filter((s) => s.projection)).toHaveLength(0);
});

it("refreshes missing legacy obligations from the matching public award without mutating raw source", async () => {
  const { refreshMissingObligations } = await import("./editing");
  const data = {
    ...demo,
    organization: { ...demo.organization, uei: "MY4DNWXWL7M1" },
    jobs: [{ ...demo.jobs[0]!, source_snapshot_id: "source", obligated_cents: null }],
    snapshots: [
      {
        id: "source",
        organization_id: demo.jobs[0]!.organization_id,
        external_id: "real-award",
        source_url: "https://www.usaspending.gov/award/real-award",
        original: { description: "ORIGINAL RAW" },
        fetched_at: new Date(),
      },
    ],
  };
  const before = JSON.stringify(data);
  const seed = companySetupSeed(data, "2026-11-03");
  const found = {
    ...seed.result,
    awards: [{ ...seed.result.awards[0]!, externalId: "real-award", obligationsCents: 337700000 }],
  };
  const refreshed = await refreshMissingObligations(data, "2026-11-03", async () => found);
  expect(refreshed.jobs[0]!.obligated_cents).toBe(337700000);
  expect(JSON.stringify(data)).toBe(before);
  expect(
    (
      await refreshMissingObligations(data, "2026-11-03", async () => ({
        kind: "error",
        message: "Unavailable",
      }))
    ).jobs[0]!.obligated_cents,
  ).toBeNull();
});

it("removing tracking keeps real invoice receipts and entered costs in the forecast", () => {
  const date = "2026-11-03",
    job = demo.jobs[0]!;
  const cost = {
    ...demo.costs[0]!,
    job_id: null,
    cost_scope: "unclassified" as const,
    category: "payroll",
    start_date: date,
    end_date: null,
  };
  const data = {
    ...demo,
    jobs: [{ ...job, is_tracked: false }],
    costs: [cost],
    invoices: [{ ...demo.invoices[0]!, job_id: job.id, expected_payment_date: "2026-11-10" }],
    payments: [],
  };
  const result = forecast(data, date);
  expect(result.sources.some((s) => s.kind === "cost" && s.label.includes(cost.label))).toBe(true);
  expect(result.sources.some((s) => s.kind === "receipt" && !s.projection)).toBe(true);
  expect(result.sources.some((s) => s.projection)).toBe(false);
});
