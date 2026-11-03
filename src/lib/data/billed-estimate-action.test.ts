import { it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  ctx: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  maybe: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./repository", () => ({
  loadData: mocks.load,
  requireOrganization: mocks.ctx,
  context: mocks.ctx,
}));
vi.mock("../supabase/server", () => ({
  userDataClient: async () => ({ from: () => ({ update: mocks.update, insert: mocks.insert }) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { useBilledEstimate } from "./actions";
import { zeroBilledDemo } from "@/components/product/tests/fixtures";
import { billedEstimateSuggestion } from "../job-billing";
import { forecast } from "../forecast";
const date = "2026-01-01",
  job = { ...zeroBilledDemo.jobs[0]!, end_date: "2026-06-30" },
  data = { ...zeroBilledDemo, jobs: [job], readOnly: false };
const form = (amount: number) => {
  const f = new FormData();
  f.set("job_id", job.id);
  f.set("expected_estimate_cents", String(amount));
  return f;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${date}T12:00:00Z`));
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(data);
  mocks.ctx.mockResolvedValue({ organization: data.organization, readOnly: false });
  const query = { eq: mocks.eq, select: () => ({ maybeSingle: mocks.maybe, single: mocks.maybe }) };
  mocks.eq.mockReturnValue(query);
  mocks.update.mockReturnValue(query);
  mocks.insert.mockReturnValue(query);
  mocks.maybe.mockResolvedValue({ data: { id: "saved" }, error: null });
});
import { afterEach } from "vitest";
afterEach(() => vi.useRealTimers());
it("only saves an explicitly accepted, server-verified estimate and preserves all other assumptions", async () => {
  const amount = billedEstimateSuggestion(job, data.assumptions[0], [], [], [], date)!;
  const before = JSON.stringify(data);
  forecast(data, date);
  expect(JSON.stringify(data)).toBe(before);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(await useBilledEstimate({}, form(amount))).toEqual({ success: "Saved." });
  expect(mocks.update).toHaveBeenCalledWith({
    billed_before_tracking_cents: amount,
    billed_through_date: date,
    billed_source: "schedule",
  });
  expect(mocks.eq).toHaveBeenCalledWith("organization_id", data.organization.id);
  expect(mocks.eq).toHaveBeenCalledWith("job_id", job.id);
  expect(mocks.eq).toHaveBeenCalledWith("billed_before_tracking_cents", 0);
  expect(
    forecast(
      {
        ...data,
        assumptions: [
          {
            ...data.assumptions[0]!,
            billed_before_tracking_cents: amount,
            billed_through_date: date,
          },
        ],
      },
      date,
    )
      .weeks.slice(0, 5)
      .some((w) => w.inflowCents > 0),
  ).toBe(true);
});
it("rejects stale or tampered amounts and never overwrites a billing total entered since the page loaded", async () => {
  expect((await useBilledEstimate({}, form(1))).error).toContain("estimate changed");
  expect(mocks.update).not.toHaveBeenCalled();
  const amount = billedEstimateSuggestion(job, data.assumptions[0], [], [], [], date)!;
  mocks.maybe.mockResolvedValue({ data: null, error: null });
  expect((await useBilledEstimate({}, form(amount))).error).toContain("Billed so far changed");
  mocks.load.mockResolvedValue({
    ...data,
    assumptions: [{ ...data.assumptions[0]!, billed_before_tracking_cents: 100000 }],
  });
  mocks.update.mockClear();
  expect((await useBilledEstimate({}, form(amount))).error).toContain("Billing details");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("denies read-only/demo access before any financial write", async () => {
  mocks.ctx.mockResolvedValue({ organization: data.organization, readOnly: true });
  expect((await useBilledEstimate({}, form(100000))).error).toContain("permission");
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});
