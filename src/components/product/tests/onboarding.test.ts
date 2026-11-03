import { beforeEach, describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ context: vi.fn(), lookup: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data/repository", () => ({ context: mocks.context }));
vi.mock("@/lib/usaspending", () => ({ lookupUei: mocks.lookup }));
vi.mock("@/lib/data/actions", () => ({ finishOnboarding: vi.fn() }));
import OnboardingPage from "@/app/(app)/onboarding/page";
async function html(params: { manual?: string; uei?: string } = {}) {
  return renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve(params) }));
}
describe("onboarding manual entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ organization: undefined });
  });
  it("starts with UEI lookup and an explicit link to manual entry", async () => {
    const result = await html();
    expect(result).toContain("Continue with manual entry");
    expect(result).toContain("/onboarding?manual=1#company-details");
    expect(result).not.toContain("Company name");
  });
  it("switches to company details without requiring or fetching a UEI", async () => {
    const result = await html({ manual: "1", uei: "JTAPCFM4NSL4" });
    expect(result).toContain("Enter company details");
    expect(result).toContain("Company name");
    expect(result).toContain("Create workspace");
    expect(result).toContain("Look up company by UEI instead");
    expect(result).not.toContain("Unique Entity Identifier");
    expect(result).toContain('name="uei" value=""');
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("keeps manual company entry available when lookup fails", async () => {
    mocks.lookup.mockResolvedValue({
      kind: "error",
      message: "Lookup unavailable. Continue manually.",
    });
    const result = await html({ uei: "JTAPCFM4NSL4" });
    expect(result).toContain("Lookup unavailable");
    expect(result).toContain("Company name");
    expect(result).toContain("Create workspace");
  });
});
