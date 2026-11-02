import { z } from "zod";
export type Award = {
  externalId: string;
  contractNumber: string;
  agency: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  contractValueCents: number | null;
  obligationsCents: number | null;
  sourceUrl: string;
};
export type Lookup =
  | { kind: "found"; name: string; uei: string; awards: Award[]; hasMore: boolean }
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
/** No keys, no durable recipient cache. Failures always preserve the manual path. */
export async function lookupUei(
  uei: string,
  fetcher: typeof fetch = fetch,
  page = 1,
): Promise<Lookup> {
  if (!/^[A-Z0-9]{12}$/.test(uei)) return { kind: "error", message: "Enter a 12-character UEI." };
  try {
    const request = async (path: string, body?: unknown) => {
      const response = await fetcher(`${root}${path}`, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("USAspending unavailable");
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
    const search = z
      .object({
        results: z.array(z.record(z.string(), z.unknown())),
        page_metadata: z.object({ hasNext: z.boolean() }),
      })
      .parse(
        await request("/search/spending_by_award/", {
          filters: { recipient_search_text: [uei], award_type_codes: ["A", "B", "C", "D"] },
          fields: [
            "Award ID",
            "Recipient Name",
            "Award Amount",
            "Awarding Agency",
            "Start Date",
            "End Date",
            "Description",
            "generated_internal_id",
          ],
          page,
          limit: 20,
          sort: "Award Amount",
          order: "desc",
        }),
      );
    const details = await Promise.all(
      search.results.map(async (row): Promise<Award | null> => {
        const externalId = nullableText(row.generated_internal_id);
        if (!externalId) return null;
        const detail = z
          .record(z.string(), z.unknown())
          .parse(await request(`/awards/${encodeURIComponent(externalId)}/`));
        const recipientInfo = detail.recipient as Record<string, unknown> | undefined;
        if (recipientInfo?.recipient_uei !== uei) return null;
        const performance = detail.period_of_performance as Record<string, unknown> | undefined;
        const agency = detail.awarding_agency as Record<string, unknown> | undefined;
        const topAgency = agency?.toptier_agency as Record<string, unknown> | undefined;
        const number = nullableText(detail.piid);
        if (!number) return null;
        return {
          externalId,
          contractNumber: number,
          agency: nullableText(topAgency?.name),
          description: nullableText(detail.description),
          startDate: date(performance?.start_date),
          endDate: date(performance?.end_date),
          contractValueCents: dollars(detail.base_exercised_options),
          obligationsCents: dollars(detail.total_obligation),
          sourceUrl: `https://www.usaspending.gov/award/${encodeURIComponent(externalId)}`,
        };
      }),
    );
    const awards = details.filter((award): award is Award => award !== null);
    return {
      kind: "found",
      name: recipient.recipient_name ?? "",
      uei,
      awards,
      hasMore: search.page_metadata.hasNext,
    };
  } catch {
    return {
      kind: "error",
      message:
        "USAspending could not be reached or returned incomplete data. Continue manually or try again.",
    };
  }
}
