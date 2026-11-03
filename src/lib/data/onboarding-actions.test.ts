import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  rpc: vi.fn(),
  lookup: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw Error(`Redirect: ${target}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("./repository", () => ({ context: mocks.context, requireOrganization: vi.fn() }));
vi.mock("../supabase/server", () => ({ userDataClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("../usaspending", () => ({ lookupUei: mocks.lookup }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { finishOnboarding } from "./actions";
import { today } from "../finance";
function form() {
  const data = new FormData();
  for (const [k, v] of Object.entries({
    name: "Test company",
    uei: "",
    opening_balance: "250000",
    payroll: "60000",
    monthly: "",
    as_of_date: today(),
  }))
    data.set(k, v);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ organization: undefined });
  mocks.rpc.mockResolvedValue({ data: "org-id", error: null });
});
describe("real onboarding action recovery", () => {
  it("saves the entered bank balance and payroll in cents and redirects to completion", async () => {
    await expect(finishOnboarding({}, form())).rejects.toThrow("Redirect: /onboarding?done=1");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "complete_onboarding",
      expect.objectContaining({
        opening_balance: 25000000,
        payroll: 6000000,
        other_monthly_costs: null,
      }),
    );
  });
  it.each(["PGRST202", "PGRST203", "42883"])(
    "explains a missing/stale database function (%s) without discarding the draft",
    async (code) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "internal function signature details" },
      });
      const result = await finishOnboarding({}, form());
      expect(result.error).toContain("supabase/setup.sql");
      expect(result.error).toContain("saved progress is kept");
      expect(result.error).not.toContain("internal");
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
  it("reports a failed public-award refresh without creating any rows", async () => {
    const data = form();
    data.set("uei", "HSNPS86TJGM6");
    data.append("award", "selected-award");
    mocks.lookup.mockResolvedValue({ kind: "error", message: "API failure" });
    expect((await finishOnboarding({}, data)).error).toContain(
      "Could not refresh your selected contracts",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("handles retry after a successful commit without trying to recreate the workspace", async () => {
    mocks.context.mockResolvedValue({ organization: { id: "existing" } });
    await expect(finishOnboarding({}, form())).rejects.toThrow("Redirect: /onboarding?done=1");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
