import recording from "./hsnps86tjgm6.json";
/** Recorded public responses; never used by application routes. */
export const recordedUei = recording.uei;
export function recordedFetcher(): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.pathname.endsWith("/autocomplete/recipient/"))
      return Response.json(recording.recipient);
    if (url.pathname.endsWith("/search/spending_by_award/")) {
      const body = JSON.parse(String(init?.body));
      return Response.json(
        recording.pages[Number(body.page) - 1] ?? {
          results: [],
          page_metadata: { hasNext: false },
        },
      );
    }
    const id = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1)!);
    const detail = (recording.details as Record<string, unknown>)[id];
    return detail ? Response.json(detail) : new Response("", { status: 404 });
  };
}
