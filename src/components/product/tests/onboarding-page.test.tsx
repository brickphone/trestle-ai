import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyDraft } from "@/lib/onboarding/model";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  read: vi.fn(),
  lookup: vi.fn(),
  load: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  requireUser: async () => ({ id: "verified-user", email: "owner@example.test" }),
}));
vi.mock("@/lib/data/repository", () => ({ context: mocks.context, loadData: mocks.load }));
vi.mock("@/lib/supabase/server", () => ({
  userDataClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, id: string) => {
          expect(column).toBe("user_id");
          expect(id).toBe("verified-user");
          return { maybeSingle: mocks.read };
        },
      }),
    }),
  }),
}));
vi.mock("@/lib/usaspending", () => ({ lookupUei: mocks.lookup }));
vi.mock("@/lib/data/actions", () => ({
  finishOnboarding: vi.fn(),
  updateCompanySetup: vi.fn(),
  saveContracts: vi.fn(),
}));
vi.mock("@/lib/onboarding/actions", () => ({
  saveOnboardingDraft: vi.fn(),
  findOnboardingCompany: vi.fn(),
}));
vi.mock("@/lib/usaspending/actions", () => ({ loadOlderAwards: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    throw Error(`Redirect: ${target}`);
  },
}));
import { demo } from "./fixtures";
import EditContractsPage from "@/app/(app)/contracts/edit/page";
import OnboardingPage from "@/app/(onboarding)/onboarding/page";
const render = async (params: Record<string, string> = {}) =>
  renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve(params) }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ organization: undefined });
  mocks.read.mockResolvedValue({ data: null, error: null });
});
describe("focused onboarding server resume", () => {
  it("starts with a single UEI question and preserves the manual URL", async () => {
    const html = await render();
    expect(html).toContain("Step 1 of 5");
    expect(html).not.toContain("Company name");
    expect(html).toContain('aria-label="Onboarding steps"');
    expect(html).not.toContain('aria-label="Main navigation"');
    const manual = await render({ manual: "1" });
    expect(manual).toContain("What’s your company called?");
    expect(manual).toContain("Company name");
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("loads the verified user's saved step and financial entries", async () => {
    mocks.read.mockResolvedValue({
      data: {
        draft: {
          ...emptyDraft("2021-03-01"),
          step: 4,
          manual: true,
          name: "Saved company",
          payroll: "1234",
          monthly: "500",
        },
      },
      error: null,
    });
    const html = await render();
    expect(html).toContain("Step 5 of 5");
    expect(html).toContain('value="1,234"');
    expect(html).toContain('value="500"');
  });
  it("keeps the UEI and manual fallback visible when public lookup fails on resume", async () => {
    mocks.read.mockResolvedValue({
      data: {
        draft: { ...emptyDraft("2021-03-01"), step: 2, uei: "HSNPS86TJGM6", name: "Saved company" },
      },
      error: null,
    });
    mocks.lookup.mockResolvedValue({ kind: "error", message: "Recorded API error" });
    const html = await render();
    expect(html).toContain('value="HSNPS86TJGM6"');
    expect(html).toContain("Recorded API error");
    expect(html).toContain("Continue with manual entry");
  });
  it("only exposes the finish screen after a workspace exists", async () => {
    await expect(render({ done: "1" })).rejects.toThrow("Redirect: /onboarding");
    mocks.context.mockResolvedValue({ organization: { id: "org" } });
    await expect(render()).rejects.toThrow("Redirect: /");
    mocks.read.mockClear();
    expect(await render({ done: "1" })).toContain("You’re set up");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("editing current company setup", () => {
  const org = {
    ...demo.organization,
    id: "10000000-0000-4000-8000-000000000001",
    is_demo: false,
    uei: "HSNPS86TJGM6",
  };
  it("redirects legacy edit URLs to the app-shell contracts editor without loading an onboarding draft", async () => {
    mocks.context.mockResolvedValue({ organization: org, isOwner: true, readOnly: false });
    await expect(render({ edit: "1" })).rejects.toThrow("Redirect: /contracts/edit");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
});

it("renders contract editing without onboarding steps and denies non-owner/read-only workspaces", async () => {
  mocks.load.mockResolvedValue({ ...demo, isOwner: true, readOnly: false });
  const html = renderToStaticMarkup(await EditContractsPage());
  expect(html).toContain("Edit contracts");
  expect(html).toContain(">Save<");
  expect(html).toContain(">Cancel<");
  expect(html).not.toContain("Onboarding steps");
  expect(html).not.toContain("Step 3 of 5");
  for (const permissions of [
    { isOwner: false, readOnly: false },
    { isOwner: true, readOnly: true },
  ]) {
    mocks.load.mockResolvedValue({ ...demo, ...permissions });
    await expect(EditContractsPage()).rejects.toThrow("Redirect: /settings");
  }
});
