import { z } from "zod";
import { today } from "@/lib/finance";
import { cleanAwardDescription, recentAwardCutoff, sortAwards } from "./presentation";

export type Award = {
  externalId: string;
  contractNumber: string;
  rawContractNumber: string;
  isTaskOrder: boolean;
  parentAwardId: string | null;
  parentAwardUrl: string | null;
  agency: string | null;
  description: string | null;
  displayDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  contractValueCents: number | null;
  obligationsCents: number | null;
  placeOfPerformanceCity: string | null;
  placeOfPerformanceState: string | null;
  sourceUrl: string;
};
export type Lookup =
  | {
      kind: "found";
      name: string;
      uei: string;
      awards: Award[];
      totalAwards: number;
      city?: string | null;
      state?: string | null;
      hasOlder: boolean;
      searchPages: number;
      cutoff: string;
    }
  | { kind: "not-found" | "error"; message: string };
const root = "https://api.usaspending.gov/api/v2";
const nullableText = (value: unknown) =>
  typeof value === "string" && value.trim() && value !== "null" ? value : null;
const dollars = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000_000_000
    ? Math.round(value * 100)
    : null;
const date = (value: unknown) => {
  const parsed = z.iso.date().safeParse(value);
  return parsed.success ? parsed.data : null;
};
const object = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Exhaust search pagination, then hydrate recent awards. Never filter by action date. */
export async function lookupUei(
  uei: string,
  fetcher: typeof fetch = fetch,
  options: { includeOlder?: boolean; asOfDate?: string; selectedAwardIds?: string[] } = {},
): Promise<Lookup> {
  if (!/^[A-Z0-9]{12}$/.test(uei)) return { kind: "error", message: "Enter a 12-character UEI." };
  try {
    const cutoff = recentAwardCutoff(options.asOfDate ?? today());
    const request = async (path: string, body?: unknown) => {
      const response = await fetcher(`${root}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw Error("USAspending unavailable");
      return response.json() as Promise<unknown>;
    };
    const recipient = z
      .object({
        results: z.array(
          z.object({ uei: z.string().nullable(), recipient_name: z.string().nullable() }),
        ),
      })
      .parse(await request("/autocomplete/recipient/", { search_text: uei, limit: 50 }))
      .results.find((r) => r.uei === uei);
    if (!recipient)
      return { kind: "not-found", message: "UEI not found. Enter your company and jobs manually." };
    const rows = new Map<string, Record<string, unknown>>();
    let searchPages = 0;
    for (let page = 1; ; page++) {
      if (page > 500) throw Error("Search could not be completed");
      const search = z
        .object({
          results: z.array(z.record(z.string(), z.unknown())),
          page_metadata: z.object({ hasNext: z.boolean() }),
        })
        .parse(
          await request("/search/spending_by_award/", {
            filters: { recipient_search_text: [uei], award_type_codes: ["A", "B", "C", "D"] },
            fields: ["Award ID", "Recipient UEI", "End Date", "generated_internal_id"],
            page,
            limit: 100,
            sort: "End Date",
            order: "desc",
          }),
        );
      searchPages++;
      let added = 0;
      for (const row of search.results) {
        const id = nullableText(row.generated_internal_id);
        if (!id) throw Error("Award source identifier missing");
        if (!rows.has(id)) {
          rows.set(id, row);
          added++;
        }
      }
      if (!search.page_metadata.hasNext) break;
      if (added === 0) throw Error("Pagination did not advance");
    }
    const candidates = [...rows].filter(
      ([, row]) => !nullableText(row["Recipient UEI"]) || row["Recipient UEI"] === uei,
    );
    const hydrate = candidates.filter(([id, row]) =>
      options.selectedAwardIds
        ? options.selectedAwardIds.includes(id)
        : options.includeOlder ||
          !nullableText(row["Recipient UEI"]) ||
          !date(row["End Date"]) ||
          date(row["End Date"])! >= cutoff,
    );
    const awards: Award[] = [];
    let mismatches = 0;
    let companyLocation: Record<string, unknown> | undefined;
    for (let offset = 0; offset < hydrate.length; offset += 4) {
      const batch = await Promise.all(
        hydrate.slice(offset, offset + 4).map(async ([externalId]): Promise<Award | null> => {
          const detail = z
            .record(z.string(), z.unknown())
            .parse(await request(`/awards/${encodeURIComponent(externalId)}/`));
          if (object(detail.recipient)?.recipient_uei !== uei) {
            mismatches++;
            return null;
          }
          companyLocation ??= object(object(detail.recipient)?.location);
          const rawContractNumber = nullableText(detail.piid);
          if (!rawContractNumber) throw Error("Award contract identifier missing");
          const parent = object(detail.parent_award);
          const parentAwardId = nullableText(parent?.piid);
          const parentExternal = nullableText(parent?.generated_unique_award_id);
          const isTaskOrder =
            detail.type === "C" ||
            /(?:TASK|DELIVERY) ORDER/i.test(nullableText(detail.type_description) ?? "");
          const contractNumber = isTaskOrder
            ? `Task order ${rawContractNumber} under ${parentAwardId ?? "parent award Not available"}`
            : parentAwardId
              ? `${rawContractNumber} under ${parentAwardId}`
              : rawContractNumber;
          const performance = object(detail.period_of_performance),
            location = object(detail.place_of_performance);
          const description = nullableText(detail.description);
          return {
            externalId,
            contractNumber,
            rawContractNumber,
            isTaskOrder,
            parentAwardId,
            parentAwardUrl: parentExternal
              ? `https://www.usaspending.gov/award/${encodeURIComponent(parentExternal)}`
              : null,
            agency: nullableText(object(object(detail.awarding_agency)?.toptier_agency)?.name),
            description,
            displayDescription: cleanAwardDescription(description),
            startDate: date(performance?.start_date),
            endDate: date(performance?.end_date),
            contractValueCents: dollars(detail.base_exercised_options),
            obligationsCents: dollars(detail.total_obligation),
            placeOfPerformanceCity: nullableText(location?.city_name),
            placeOfPerformanceState: nullableText(location?.state_code),
            sourceUrl: `https://www.usaspending.gov/award/${encodeURIComponent(externalId)}`,
          };
        }),
      );
      for (const award of batch)
        if (
          award &&
          (options.selectedAwardIds ||
            options.includeOlder ||
            !award.endDate ||
            award.endDate >= cutoff)
        )
          awards.push(award);
    }
    const totalAwards = candidates.length - mismatches;
    return {
      kind: "found",
      name: recipient.recipient_name ?? "",
      city: nullableText(companyLocation?.city_name),
      state: nullableText(companyLocation?.state_code),
      uei,
      awards: sortAwards(awards),
      totalAwards,
      hasOlder: awards.length < totalAwards,
      searchPages,
      cutoff,
    };
  } catch {
    return {
      kind: "error",
      message:
        "USAspending could not be reached or returned incomplete data. Continue manually or try again.",
    };
  }
}
