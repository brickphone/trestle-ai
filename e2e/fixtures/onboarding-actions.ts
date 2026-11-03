/** Test-only replacement for the Next server action, using recorded public API responses. */
import { lookupUei } from "@/lib/usaspending";
import { recordedFetcher } from "@/lib/usaspending/fixtures/replay";
export async function loadOlderAwards(uei: string) {
  if (location.search.includes("older-error"))
    return { kind: "error" as const, message: "Older awards could not be loaded. Try again." };
  return lookupUei(uei, recordedFetcher(), { includeOlder: true, asOfDate: "2021-03-01" });
}
