import { inProgressDemo, zeroBilledDemo, contractsDemo, missingContractsDemo } from "./fixtures";
import EditContracts from "@/app/(app)/contracts/edit/page";
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
      "updateCompanySetup",
      "saveContracts",
      "useBilledEstimate",
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

import NewJob from "@/app/(app)/jobs/new/page";
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

import { demo, projectedDemo, editDemo } from "./fixtures";
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
    { name: "jobs-owner", path: "/jobs", page: Jobs },
    { name: "job-new", path: "/jobs/new", page: NewJob },
    { name: "overview-zero-billed-owner", path: "/", page: Overview },
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
    { name: "overview-in-progress", path: "/", page: Overview },
    {
      name: "forecast-in-progress",
      path: "/forecast",
      page: () => Forecast({ searchParams: Promise.resolve({}) }),
    },
    { name: "overview-zero-billed", path: "/", page: Overview },
    {
      name: "job-zero-billed",
      path: "/jobs/zero",
      page: () => Job({ params: Promise.resolve({ id: zeroBilledDemo.jobs[0]!.id }) }),
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
    { name: "contracts-edit", path: "/contracts/edit", page: EditContracts },
    { name: "contracts-missing", path: "/contracts/edit", page: EditContracts },
    { name: "settings-owner", path: "/settings", page: Settings },
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
          /projected|in-progress|zero-billed/.test(screen.name)
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
        const data = screen.name.includes("in-progress")
          ? inProgressDemo
          : screen.name.includes("zero-billed")
            ? {
                ...zeroBilledDemo,
                readOnly: !screen.name.endsWith("owner"),
                organization: {
                  ...zeroBilledDemo.organization,
                  is_demo: !screen.name.endsWith("owner"),
                },
              }
            : screen.name === "contracts-edit"
              ? contractsDemo
              : screen.name === "contracts-missing"
                ? missingContractsDemo
                : ["settings-owner", "jobs-owner", "job-new"].includes(screen.name)
                  ? editDemo
                  : screen.name.includes("projected")
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
              organizationName={data.organization.name}
              demo={data.organization.is_demo}
              isStaff={screen.path.startsWith("/internal")}
              footer={
                <AccountMenu
                  email="founder@example.test"
                  signOutAction={async () => {}}
                  placement="above"
                />
              }
            >
              {content}
            </AppShell>
          ),
        );
        if (!screen.auth && !screen.onboarding && data.organization.is_demo)
          expect(html).toContain("Demo, fictional data");
        expect(html).toContain('<main id="main"');
        // Global contract: every rendered calendar date, including plain-text hero/tooltip copy, has a year.
        const text = html.replace(/<[^>]+>/g, " ").replace(/&[^;]+;/g, " ");
        const dates = text.matchAll(
          /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}\b(?:,?\s+\d{4}\b)?/g,
        );
        for (const date of dates)
          expect(date[0], `${screen.name}: date must include a year`).toMatch(/\d{4}\b/);
        for (const time of html.matchAll(
          /<time[^>]*dateTime="(\d{4})-[^"]*"[^>]*>([^<]+)<\/time>/g,
        ))
          expect(time[2]).toContain(time[1]);
        if (process.env.VISUAL_FIXTURES_DIR) {
          mkdirSync(process.env.VISUAL_FIXTURES_DIR, { recursive: true });
          writeFileSync(`${process.env.VISUAL_FIXTURES_DIR}/${screen.name}.html`, html);
        }
      } finally {
        vi.useRealTimers();
      }
    });
});
