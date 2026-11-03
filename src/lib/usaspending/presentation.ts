import type { Award } from ".";

/** Display-only FPDS flag cleanup (including misplaced/trailing flags). Award.description remains the original API text. */
export function cleanAwardDescription(value: string | null) {
  if (value === null) return null;
  return (
    value
      .replace(/IGF::(?:OT|CL|CT)::IGF/gi, "")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}
export function awardStatus(award: Pick<Award, "endDate">, asOf: string) {
  return award.endDate === null
    ? "Status unavailable"
    : award.endDate >= asOf
      ? "Active"
      : "Completed";
}
export function recentAwardCutoff(asOf: string) {
  const date = new Date(`${asOf}T00:00:00Z`);
  const year = date.getUTCFullYear() - 2,
    month = date.getUTCMonth();
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), last)))
    .toISOString()
    .slice(0, 10);
}
export function sortAwards(awards: Award[]) {
  return [...awards].sort(
    (a, b) =>
      (b.endDate ?? "").localeCompare(a.endDate ?? "") ||
      a.contractNumber.localeCompare(b.contractNumber) ||
      a.externalId.localeCompare(b.externalId),
  );
}
