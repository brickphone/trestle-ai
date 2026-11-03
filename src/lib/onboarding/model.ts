import { readableCase } from "@/lib/display-case";
import { z } from "zod";
import type { Award } from "@/lib/usaspending";
import { awardStatus, cleanAwardDescription } from "@/lib/usaspending/presentation";

export function isUmbrella(award: Award) {
  return (
    award.obligationsCents === 0 ||
    /minimum[ -]+guarantee|\bumbrella\b|\bIDIQ\s+(?:base|umbrella|contract)\b|\bbase\s+IDIQ\b|indefinite[ -]+delivery.{0,30}indefinite[ -]+quantity/i.test(
      award.description ?? "",
    )
  );
}
export function preselectedAwards(awards: Award[], asOf: string) {
  return awards
    .filter(
      (a) => awardStatus(a, asOf) === "Active" && (a.obligationsCents ?? 0) > 0 && !isUmbrella(a),
    )
    .map((a) => a.externalId);
}
/** Sentence case only all-capital source text. Mixed-case names and raw snapshots stay intact. */
export function sentenceDescription(value: string | null) {
  return readableCase(cleanAwardDescription(value), "sentence");
}
export const draftSchema = z.object({
  step: z.number().int().min(0).max(4),
  furthestStep: z.number().int().min(0).max(4).optional(),
  uei: z.string().regex(/^([A-Z0-9]{12})?$/),
  manual: z.boolean(),
  name: z.string().max(200),
  selected: z.array(z.string().max(250)).max(1000),
  includeOlder: z.boolean(),
  balance: z.string().max(30),
  asOf: z.iso.date(),
  payroll: z.string().max(30),
  monthly: z.string().max(30),
  awardInputs: z
    .record(z.string().max(250), z.object({ billed: z.string().max(30), lag: z.string().max(5) }))
    .optional(),
});
export type OnboardingDraft = z.infer<typeof draftSchema>;
export const emptyDraft = (asOf: string): OnboardingDraft => ({
  step: 0,
  uei: "",
  manual: false,
  name: "",
  selected: [],
  includeOlder: false,
  balance: "",
  asOf,
  payroll: "",
  monthly: "",
});
