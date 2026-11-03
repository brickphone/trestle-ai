import { it, expect } from "vitest";
import { companySetupSeed } from "./editing";
import { demo } from "@/components/product/tests/fixtures";
it("prefills only managed setup costs, existing jobs and the saved balance without altering records", () => {
  const data = {
    ...demo,
    organization: { ...demo.organization, id: "10000000-0000-4000-8000-000000000001" },
    costs: [
      {
        ...demo.costs[0]!,
        job_id: null,
        cost_scope: "overhead" as const,
        label: "Monthly overhead",
        frequency: "monthly",
        amount_cents: 3500000,
        start_date: "2026-11-01",
      },
      {
        ...demo.costs[0]!,
        id: "office",
        job_id: null,
        cost_scope: "overhead" as const,
        label: "Weekly office payroll",
        frequency: "weekly",
        amount_cents: 500000,
        start_date: "2026-11-01",
      },
      {
        ...demo.costs[0]!,
        id: "field",
        job_id: null,
        cost_scope: "unclassified" as const,
        label: "Weekly payroll estimate",
        frequency: "weekly",
        amount_cents: 6000000,
        start_date: "2026-11-01",
      },
      {
        ...demo.costs[0]!,
        id: "other",
        job_id: null,
        cost_scope: "overhead" as const,
        label: "Insurance",
        frequency: "monthly",
        amount_cents: 100000,
        start_date: "2026-11-01",
      },
    ],
  };
  const before = JSON.stringify(data);
  const seed = companySetupSeed(data, "2026-11-03");
  expect(seed.initial.editingOrganizationId).toBe(data.organization.id);
  expect(seed.initial.name).toBe(data.organization.name);
  expect(seed.initial.monthly).toBe("35000");
  expect(seed.initial.payroll).toBe("5000");
  expect(seed.initial.balance).toBe(String(demo.balances[0]!.amount_cents / 100));
  expect(seed.initial.selected).toEqual(data.jobs.filter((j) => !j.voided_at).map((j) => j.id));
  expect(seed.result.awards).toHaveLength(seed.initial.selected.length);
  expect(seed.result.awards[0]!.sourceUrl).toBe(`/jobs/${seed.initial.selected[0]}`);
  expect(JSON.stringify(data)).toBe(before);
});
