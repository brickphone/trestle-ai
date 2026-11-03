import { lookupUei } from "@/lib/usaspending";
async function lookupForFixture() {
  const found = await lookupUei("HSNPS86TJGM6");
  if (found.kind !== "found") throw Error("Fixture lookup");
  return found;
}
import type * as SpendingApi from "@/lib/usaspending";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";

const mocks = vi.hoisted(() => ({ load: vi.fn(), path: "/", context: vi.fn() }));
vi.mock("@/lib/usaspending", async (original) => {
  const actualApi = await original<typeof SpendingApi>();
  return {
    ...actualApi,
    lookupUei: (uei: string) =>
      actualApi.lookupUei(uei, recordedFetcher(), {
        asOfDate: new Date().toISOString().slice(0, 10),
      }),
  };
});
vi.mock("@/lib/usaspending/actions", () => ({ loadOlderAwards: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({
  requireUser: async () => ({ id: "fixture-user", email: "founder@example.test" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  userDataClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/onboarding/actions", () => ({
  saveOnboardingDraft: vi.fn(),
  findOnboardingCompany: vi.fn(),
}));
vi.mock("@/app/(app)/dev/type/soehne-reference.png", () => ({
  default: { src: "/reference.png", width: 1100, height: 720 },
}));
vi.mock("@/lib/data/repository", () => ({
  loadData: mocks.load,
  context: mocks.context,
  recordHistory: async () => [],
}));
vi.mock("next/font/local", () => ({
  default: ({ src }: { src: string }) => ({
    style: {
      fontFamily: src.includes("instrument")
        ? "instrument"
        : src.includes("hanken")
          ? "hanken"
          : "plex",
    },
  }),
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<object>()),
  usePathname: () => mocks.path,
}));
vi.mock("@/lib/data/actions", () =>
  Object.fromEntries(
    [
      "saveJob",
      "saveInvoice",
      "saveChange",
      "saveBalance",
      "saveCost",
      "classifyCost",
      "voidRecord",
      "saveAssumptions",
      "recordPayment",
      "updateInvoiceTiming",
      "selectOrganization",
      "finishOnboarding",
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock("@/lib/auth/actions", () => ({
  viewDemo: vi.fn(),
  signout: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
  magicLink: vi.fn(),
}));

import Overview from "@/app/(app)/page";
import Jobs from "@/app/(app)/jobs/page";
import Invoices from "@/app/(app)/invoices/page";
import Forecast from "@/app/(app)/forecast/page";
import Settings from "@/app/(app)/settings/page";
import Job from "@/app/(app)/jobs/[id]/page";
import Invoice from "@/app/(app)/invoices/[id]/page";
import { OnboardingFlow } from "@/components/product/onboarding-flow";
import { emptyDraft } from "@/lib/onboarding/model";
import { AccountMenu } from "@/components/product/account-menu";
import { PRODUCT_NAME } from "@/lib/config";
import Onboarding from "@/app/(onboarding)/onboarding/page";
import Calculator from "@/app/(app)/calculator/page";
import Internal from "@/app/(app)/internal/page";
import Prospects from "@/app/(app)/internal/prospects/page";
import Pipeline from "@/app/(app)/internal/pipeline/page";
import Runs from "@/app/(app)/internal/runs/page";
import Components from "@/app/(app)/dev/components/page";
import Type from "@/app/(app)/dev/type/page";
import Login from "@/app/(auth)/login/page";
import Signup from "@/app/(auth)/signup/page";
import AuthLayout from "@/app/(auth)/layout";
import { Button } from "@/components/ui/button";

import { demo, projectedDemo } from "./fixtures";
import { recordedFetcher } from "@/lib/usaspending/fixtures/replay";

describe("visual screen fixtures (isolated; never saved to a database)", () => {
  const screens: {
    name: string;
    path: string;
    page: () => React.ReactNode | Promise<React.ReactNode>;
    empty?: boolean;
    onboarding?: boolean;
    auth?: boolean;
  }[] = [
    { name: "overview-empty", path: "/", page: Overview, empty: true },
    { name: "overview-demo", path: "/", page: Overview },
    { name: "jobs", path: "/jobs", page: Jobs },
    { name: "invoices", path: "/invoices", page: Invoices },
    {
      name: "forecast",
      path: "/forecast",
      page: () => Forecast({ searchParams: Promise.resolve({}) }),
    },
    {
      name: "forecast-projected",
      path: "/forecast",
      page: () => Forecast({ searchParams: Promise.resolve({}) }),
    },
    { name: "overview-projected", path: "/", page: Overview },
    { name: "settings", path: "/settings", page: Settings },
    {
      name: "job-detail",
      path: "/jobs/demo-job",
      page: () => Job({ params: Promise.resolve({ id: "demo-job" }) }),
    },
    {
      name: "invoice-detail",
      path: "/invoices/demo-invoice-1",
      page: () => Invoice({ params: Promise.resolve({ id: "demo-invoice-1" }) }),
    },
    {
      name: "invoice-rejected",
      path: "/invoices/demo-invoice-3",
      page: () => Invoice({ params: Promise.resolve({ id: "demo-invoice-3" }) }),
    },
    {
      name: "onboarding",
      path: "/onboarding",
      onboarding: true,
      page: () => Onboarding({ searchParams: Promise.resolve({}) }),
    },
    {
      name: "onboarding-manual",
      path: "/onboarding",
      onboarding: true,
      page: () => Onboarding({ searchParams: Promise.resolve({ manual: "1" }) }),
    },
    {
      name: "onboarding-awards",
      path: "/onboarding",
      onboarding: true,
      page: async () => (
        <OnboardingFlow
          initial={{ ...emptyDraft("2021-03-01"), step: 2 }}
          initialLookup={await lookupForFixture()}
          asOf="2021-03-01"
        />
      ),
    },
    {
      name: "onboarding-no-active",
      path: "/onboarding",
      onboarding: true,
      page: async () => (
        <OnboardingFlow
          initial={{ ...emptyDraft("2026-11-03"), step: 2 }}
          initialLookup={await lookupForFixture()}
          asOf="2026-11-03"
        />
      ),
    },
    ...[0, 1, 2, 3, 4, 5].map((step) => ({
      name: `onboarding-step-${step + 1}`,
      path: "/onboarding",
      onboarding: true,
      page: async () => {
        const result = await lookupForFixture();
        return (
          <OnboardingFlow
            initial={{
              ...emptyDraft("2021-03-01"),
              step: Math.min(step, 4),
              uei: result.uei,
              name: result.name,
            }}
            initialLookup={result}
            asOf="2021-03-01"
            done={step === 5}
          />
        );
      },
    })),
    { name: "calculator", path: "/calculator", page: Calculator },
    { name: "internal", path: "/internal", page: Internal },
    { name: "prospects", path: "/internal/prospects", page: Prospects },
    { name: "pipeline", path: "/internal/pipeline", page: Pipeline },
    { name: "runs", path: "/internal/runs", page: Runs },
    { name: "components", path: "/dev/components", page: Components },
    { name: "type", path: "/dev/type", page: Type },
    {
      name: "login",
      path: "/login",
      auth: true,
      page: () => Login({ searchParams: Promise.resolve({}) }),
    },
    { name: "signup", path: "/signup", auth: true, page: Signup },
  ];
  for (const screen of screens)
    it(`renders ${screen.name} with real screen components`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(
        new Date(
          screen.name.includes("projected")
            ? "2026-01-01T12:00:00Z"
            : screen.name === "onboarding-awards"
              ? "2021-03-01T12:00:00Z"
              : screen.name === "onboarding-no-active"
                ? "2026-11-03T12:00:00Z"
                : "2026-11-02T12:00:00Z",
        ),
      );
      try {
        mocks.path = screen.path;
        const data = screen.name.includes("projected")
          ? projectedDemo
          : screen.empty
            ? {
                ...demo,
                jobs: [],
                changes: [],
                invoices: [],
                payments: [],
                balances: [],
                costs: [],
              }
            : demo;
        mocks.load.mockResolvedValue(data);
        mocks.context.mockResolvedValue(
          screen.onboarding ? { ...data, organization: undefined } : data,
        );
        const content = await screen.page();
        const html = renderToStaticMarkup(
          screen.onboarding ? (
            <>
              <header className="flex h-[73px] items-center justify-between border-b border-border px-6">
                <span>{PRODUCT_NAME}</span>
                <AccountMenu email="founder@example.test" signOutAction={async () => {}} />
              </header>
              {content}
            </>
          ) : screen.auth ? (
            <AuthLayout>{content}</AuthLayout>
          ) : (
            <AppShell
              organizationName={demo.organization.name}
              demo
              isStaff={screen.path.startsWith("/internal")}
              footer={
                <details className="text-sm">
                  <summary className="rounded px-2 py-2 text-fg-muted">Account</summary>
                  <Button variant="ghost">Sign out</Button>
                </details>
              }
            >
              {content}
            </AppShell>
          ),
        );
        if (!screen.auth && !screen.onboarding) expect(html).toContain("Demo, fictional data");
        expect(html).toContain('<main id="main"');
        if (process.env.VISUAL_FIXTURES_DIR) {
          mkdirSync(process.env.VISUAL_FIXTURES_DIR, { recursive: true });
          writeFileSync(`${process.env.VISUAL_FIXTURES_DIR}/${screen.name}.html`, html);
        }
      } finally {
        vi.useRealTimers();
      }
    });
});
