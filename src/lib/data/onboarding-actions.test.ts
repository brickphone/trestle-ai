import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  load: vi.fn(),
  requireOrganization: vi.fn(),
  rpc: vi.fn(),
  lookup: vi.fn(),
  redirect: vi.fn((target: string) => {
    throw Error(`Redirect: ${target}`);
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("./repository", () => ({
  context: mocks.context,
  loadData: mocks.load,
  requireOrganization: mocks.requireOrganization,
}));
vi.mock("../supabase/server", () => ({ userDataClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("../usaspending", () => ({ lookupUei: mocks.lookup }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { finishOnboarding, updateCompanySetup, saveContracts } from "./actions";
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

describe("company setup update action", () => {
  const org = "10000000-0000-4000-8000-000000000001";
  const editForm = () => {
    const data = form();
    data.set("organization_id", org);
    data.set(
      "job_inputs",
      JSON.stringify([
        {
          externalId: "20000000-0000-4000-8000-000000000001",
          billedCents: 25000000,
          paymentLagDays: 45,
        },
      ]),
    );
    return data;
  };
  it("updates the current owner workspace through one atomic user-JWT RPC", async () => {
    mocks.requireOrganization.mockResolvedValue({
      organization: { id: org, uei: null },
      isOwner: true,
      readOnly: false,
    });
    await expect(updateCompanySetup({}, editForm())).rejects.toThrow(
      "Redirect: /onboarding?done=1&edit=1",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_company_setup",
      expect.objectContaining({
        org_id: org,
        setup_values: expect.objectContaining({
          name: "Test company",
          openingBalanceCents: 25000000,
          payrollCents: 6000000,
          monthlyCents: null,
        }),
      }),
    );
  });
  it("rejects a different organization and non-owner/read-only requests", async () => {
    mocks.requireOrganization.mockResolvedValue({
      organization: { id: org, uei: null },
      isOwner: true,
      readOnly: false,
    });
    const data = editForm();
    data.set("organization_id", "10000000-0000-4000-8000-000000000002");
    expect((await updateCompanySetup({}, data)).error).toContain("not the current workspace");
    for (const permissions of [
      { isOwner: false, readOnly: false },
      { isOwner: true, readOnly: true },
    ]) {
      mocks.requireOrganization.mockResolvedValue({
        organization: { id: org, uei: null },
        ...permissions,
      });
      expect((await updateCompanySetup({}, editForm())).error).toContain("Only an owner");
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("contract editor saves", () => {
  const org = "10000000-0000-4000-8000-000000000001",
    job = "20000000-0000-4000-8000-000000000001";
  const form = () => {
    const f = new FormData();
    f.set("organization_id", org);
    f.set(
      "contracts",
      JSON.stringify([
        {
          id: job,
          tracked: true,
          billedCents: 25000000,
          paymentLagDays: 45,
          billedSource: "manual",
          publicObligationsCents: 1,
        },
      ]),
    );
    return f;
  };
  it("derives obligations on the server and never trusts a public amount submitted by the client", async () => {
    const { contractsDemo } = await import("@/components/product/tests/fixtures");
    mocks.requireOrganization.mockResolvedValue({
      organization: contractsDemo.organization,
      isOwner: true,
      readOnly: false,
    });
    mocks.load.mockResolvedValue(contractsDemo);
    expect(await saveContracts({}, form())).toEqual({ success: "Saved." });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_contracts",
      expect.objectContaining({
        org_id: org,
        contract_values: [
          expect.objectContaining({
            id: job,
            publicObligationsCents: 337700000,
            billedSource: "manual",
          }),
        ],
      }),
    );
  });
  it("rejects non-owners and a different workspace before fetching or saving contracts", async () => {
    mocks.requireOrganization.mockResolvedValue({
      organization: { id: org },
      isOwner: false,
      readOnly: false,
    });
    expect((await saveContracts({}, form())).error).toContain("Only an owner");
    mocks.requireOrganization.mockResolvedValue({
      organization: { id: "another" },
      isOwner: true,
      readOnly: false,
    });
    expect((await saveContracts({}, form())).error).toContain("current workspace");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
