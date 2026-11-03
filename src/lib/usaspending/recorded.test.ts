import { describe, it, expect, vi } from "vitest";
import { lookupUei } from ".";
import { awardStatus, cleanAwardDescription, recentAwardCutoff } from "./presentation";
import { recordedFetcher, recordedUei } from "./fixtures/replay";

describe("recorded construction awards and complete pagination", () => {
  it("loads both search pages, reports all 113 awards and only hydrates recent details", async () => {
    const fetcher = vi.fn(recordedFetcher());
    const result = await lookupUei(recordedUei, fetcher, { asOfDate: "2026-11-03" });
    if (result.kind !== "found") throw Error("Lookup failed");
    expect(result.totalAwards).toBe(113);
    expect(result.searchPages).toBe(2);
    expect(result.awards).toHaveLength(1);
    expect(result.hasOlder).toBe(true);
    expect(result.awards.every((a) => awardStatus(a, "2026-11-03") === "Completed")).toBe(true);
    const searches = fetcher.mock.calls.filter(([url]) =>
      String(url).includes("spending_by_award"),
    );
    expect(searches.map(([, init]) => JSON.parse(String(init?.body)).page)).toEqual([1, 2]);
    expect(searches.every(([, init]) => !JSON.parse(String(init?.body)).filters.time_period)).toBe(
      true,
    );
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("/awards/"))).toHaveLength(1);
  });
  it("fetches every older award and disambiguates repeated task-order numbers", async () => {
    const result = await lookupUei(recordedUei, recordedFetcher(), {
      includeOlder: true,
      asOfDate: "2026-11-03",
    });
    if (result.kind !== "found") throw Error("Lookup failed");
    expect(result.awards).toHaveLength(113);
    expect(result.totalAwards).toBe(113);
    expect(result.hasOlder).toBe(false);
    expect(new Set(result.awards.map((a) => a.externalId)).size).toBe(113);
    const order = result.awards.find((a) => a.rawContractNumber === "0011");
    expect(order).toBeDefined();
    expect(order?.contractNumber).toBe(`Task order 0011 under ${order?.parentAwardId}`);
    expect(order?.parentAwardUrl).toContain("/award/CONT_IDV_");
    const known = result.awards.find(
      (a) => a.rawContractNumber === "0007" && a.parentAwardId === "N6247313G3040",
    )!;
    expect(known.description).toBe("IGF::OT::IGF RENOVATE RESTROOM B467 NASNI");
    expect(known.displayDescription).toBe("RENOVATE RESTROOM B467 NASNI");
    expect([known.placeOfPerformanceCity, known.placeOfPerformanceState]).toEqual([
      "SAN DIEGO",
      "CA",
    ]);
  });
  it("can replay an historical date with genuinely active and completed records without editing the API fixture", async () => {
    const result = await lookupUei(recordedUei, recordedFetcher(), { asOfDate: "2021-03-01" });
    if (result.kind !== "found") throw Error("Lookup failed");
    expect(result.awards.some((a) => awardStatus(a, "2021-03-01") === "Active")).toBe(true);
    expect(result.awards.some((a) => awardStatus(a, "2021-03-01") === "Completed")).toBe(true);
  });
  it("never reports a complete result if a later search page fails or repeats", async () => {
    const replay = recordedFetcher();
    for (const repeated of [false, true]) {
      const fetcher: typeof fetch = async (input, init) => {
        if (
          String(input).includes("spending_by_award") &&
          JSON.parse(String(init?.body)).page === 2
        )
          return repeated
            ? replay(input, {
                ...init,
                body: JSON.stringify({ ...JSON.parse(String(init?.body)), page: 1 }),
              })
            : new Response("", { status: 503 });
        return replay(input, init);
      };
      expect((await lookupUei(recordedUei, fetcher, { asOfDate: "2026-11-03" })).kind).toBe(
        "error",
      );
    }
  });
});
describe("award presentation", () => {
  it.each(["OT", "CL", "CT"])(
    "strips the %s metadata flag for display, preserving its raw input",
    (code) => {
      const raw = `IGF::${code}::IGF Renovate clinic`;
      expect(cleanAwardDescription(raw)).toBe("Renovate clinic");
      expect(raw.startsWith("IGF::")).toBe(true);
      expect(cleanAwardDescription(`Existing work ${raw}`)).toBe("Existing work Renovate clinic");
    },
  );
  it("treats an end date of today as active and never guesses missing dates", () => {
    expect(awardStatus({ endDate: "2026-11-03" }, "2026-11-03")).toBe("Active");
    expect(awardStatus({ endDate: "2026-11-02" }, "2026-11-03")).toBe("Completed");
    expect(awardStatus({ endDate: null }, "2026-11-03")).toBe("Status unavailable");
    expect(recentAwardCutoff("2024-02-29")).toBe("2022-02-28");
  });
});

it("refreshes only selected awards at completion, including older contracts", async () => {
  const fetcher = recordedFetcher();
  const all = await lookupUei("HSNPS86TJGM6", fetcher, {
    includeOlder: true,
    asOfDate: "2026-11-03",
  });
  if (all.kind !== "found") throw Error("Recording failed");
  const chosen = all.awards.at(-1)!;
  const calls: string[] = [];
  const selectedFetcher: typeof fetch = async (input, init) => {
    calls.push(String(input));
    return recordedFetcher()(input, init);
  };
  const selected = await lookupUei("HSNPS86TJGM6", selectedFetcher, {
    selectedAwardIds: [chosen.externalId],
    asOfDate: "2026-11-03",
  });
  expect(selected.kind).toBe("found");
  if (selected.kind !== "found") throw Error("Recording failed");
  expect(selected.awards).toEqual([chosen]);
  expect(selected.totalAwards).toBe(113);
  expect(selected.searchPages).toBe(2);
  expect(calls.filter((url) => url.includes("/awards/"))).toHaveLength(1);
});
