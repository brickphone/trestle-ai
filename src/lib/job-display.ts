import type { Job } from "./data/types";
import { sentenceDescription } from "./onboarding/model";
/** Display only; source descriptions and contract identifiers are never rewritten. */
export function jobDisplayName(job: Pick<Job, "description"> | null | undefined) {
  const raw = job?.description?.trim();
  if (!raw) return "Untitled job";
  // Imported imperative award titles are easier to scan as names. Preserve user-written casing.
  const title = raw === raw.toUpperCase() ? raw.replace(/\bCONSTRUCT\s+/g, "") : raw;
  return sentenceDescription(title) ?? "Untitled job";
}
