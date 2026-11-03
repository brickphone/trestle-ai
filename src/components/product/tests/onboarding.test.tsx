import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/usaspending/actions", () => ({ loadOlderAwards: vi.fn() }));
import { AwardSelection } from "../award-selection";
import { lookupUei } from "@/lib/usaspending";
import { recordedFetcher } from "@/lib/usaspending/fixtures/replay";
import {
  preselectedAwards,
  isUmbrella,
  sentenceDescription,
  draftSchema,
  emptyDraft,
} from "@/lib/onboarding/model";

describe("onboarding selection and display", () => {
  it("preselects active work with positive obligations only", async () => {
    const result = await lookupUei("HSNPS86TJGM6", recordedFetcher(), { asOfDate: "2021-03-01" });
    if (result.kind !== "found") throw Error("fixture");
    const base = result.awards[0]!;
    const samples = [
      {
        ...base,
        externalId: "work",
        description: "RENOVATE BUILDING",
        endDate: "2021-03-01",
        obligationsCents: 100,
      },
      { ...base, externalId: "zero", obligationsCents: 0, endDate: "2030-01-01" },
      {
        ...base,
        externalId: "minimum",
        description: "MINIMUM GUARANTEE ORDER",
        obligationsCents: 100,
        endDate: "2030-01-01",
      },
      {
        ...base,
        externalId: "idiq",
        description: "IDIQ BASE CONTRACT",
        obligationsCents: 100,
        endDate: "2030-01-01",
      },
      { ...base, externalId: "unknown", obligationsCents: null, endDate: "2030-01-01" },
      {
        ...base,
        externalId: "past",
        endDate: "2020-01-01",
        description: "Work",
        obligationsCents: 100,
      },
    ];
    expect(preselectedAwards(samples, "2021-03-01")).toEqual(["work"]);
    expect(samples.filter(isUmbrella).map((a) => a.externalId)).toEqual([
      "zero",
      "minimum",
      "idiq",
    ]);
  });
  it("does not mistake a funded task order referencing its IDIQ parent for the umbrella", async () => {
    const result = await lookupUei("HSNPS86TJGM6", recordedFetcher(), { asOfDate: "2021-03-01" });
    if (result.kind !== "found") throw Error("fixture");
    const order = {
      ...result.awards[0]!,
      description: "TASK ORDER FOR ROOF REPAIRS UNDER IDIQ N123",
      obligationsCents: 100,
    };
    expect(isUmbrella(order)).toBe(false);
    expect(isUmbrella({ ...order, description: "IDIQ BASE CONTRACT" })).toBe(true);
  });
  it("sentence-cases ALL CAPS for display only and removes flags", () => {
    const raw = "IGF::OT::IGF RENOVATE RESTROOM B467";
    expect(sentenceDescription(raw)).toBe("Renovate restroom B467");
    expect(raw).toBe("IGF::OT::IGF RENOVATE RESTROOM B467");
    expect(sentenceDescription("Repair NASA facility")).toBe("Repair NASA facility");
    expect(sentenceDescription(null)).toBeNull();
  });
  it("renders every performance date with a year and qualifies task orders", async () => {
    const result = await lookupUei("HSNPS86TJGM6", recordedFetcher(), { asOfDate: "2021-03-01" });
    if (result.kind !== "found") throw Error("fixture");
    const html = renderToStaticMarkup(<AwardSelection result={result} asOf="2021-03-01" />);
    const dates = [...html.matchAll(/<time[^>]*>([^<]+)<\/time>/g)].map((m) => m[1]);
    expect(dates.length).toBeGreaterThan(1);
    dates.forEach((d) => expect(d).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/));
    expect(html).toContain("Feb 9, 2021");
    expect(html).toContain("Task order");
    expect(html).not.toContain("IGF::");
    expect(html).toContain("Past contracts");
    expect(html).not.toContain("<details open");
  });
  it("validates resumable drafts without requiring a bank balance or payroll", () => {
    expect(
      draftSchema.parse({ ...emptyDraft("2026-11-03"), step: 4, manual: true, name: "Manual co" })
        .balance,
    ).toBe("");
    expect(draftSchema.safeParse({ ...emptyDraft("2026-11-03"), step: 8 }).success).toBe(false);
  });
});
