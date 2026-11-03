import type { Job, SourceSnapshot } from "./data/types";
function cents(value: unknown) {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000_000_000
    ? value
    : null;
}
/** Recover an award's saved amount, never its parent IDV or a transaction amount. */
export function jobObligations(job: Job, snapshot?: SourceSnapshot) {
  const stored = cents(job.obligated_cents);
  if (stored !== null) return stored;
  if (
    !snapshot ||
    snapshot.id !== job.source_snapshot_id ||
    snapshot.organization_id !== job.organization_id
  )
    return null;
  return cents((snapshot.original as Record<string, unknown>)?.obligationsCents);
}
