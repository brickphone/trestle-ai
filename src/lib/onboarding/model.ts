import { FORECAST_DEFAULTS } from "@/lib/config";
import { readableCase } from "@/lib/display-case";
import { daysBetween } from "@/lib/finance";
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
export type ContractInput = { billed: string; lag: string; value?: string; estimated?: boolean };
/** Explicit schedule estimate, never an observed billing amount. */
export function scheduleBilledEstimate(
  valueCents: number | null,
  start: string | null,
  end: string | null,
  asOf: string,
): number | null {
  if (start && asOf < start) return 0;
  if (valueCents === null || valueCents <= 0 || !start || !end || end <= start) return null;
  const elapsed = Math.max(0, Math.min(daysBetween(start, asOf), daysBetween(start, end)));
  const rounded = Math.round((valueCents * elapsed) / daysBetween(start, end) / 100000) * 100000;
  // An early started job can round to zero; ask for an amount instead of silently using $0.
  return rounded === 0 ? null : Math.min(valueCents, rounded);
}
export function defaultContractInput(award: Award, asOf: string): ContractInput {
  const value = award.obligationsCents ?? award.contractValueCents;
  const billed = scheduleBilledEstimate(value, award.startDate, award.endDate, asOf);
  return {
    billed: billed === null ? "" : String(billed / 100),
    lag: String(FORECAST_DEFAULTS.paymentLagDays),
    estimated: billed !== null && billed > 0,
  };
}
export const draftSchema = z.object({
  step: z.number().int().min(0).max(4),
  editingOrganizationId: z.uuid().optional(),
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
    .record(
      z.string().max(250),
      z.object({
        billed: z.string().max(30),
        lag: z.string().max(5),
        value: z.string().max(30).optional(),
        estimated: z.boolean().optional(),
      }),
    )
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
export function validContractInput(award: Award, input: ContractInput) {
  const validAmount = (v: string | undefined) =>
    !!v && /^\d+(?:\.\d{0,2})?$/.test(v) && Number(v) * 100 <= 1e12;
  const missing =
    award.requiresContractValue ??
    (award.obligationsCents === null && award.contractValueCents === null);
  return (
    validAmount(input.billed) &&
    Number(input.billed) >= 0 &&
    /^\d+$/.test(input.lag) &&
    Number(input.lag) <= 36500 &&
    (!missing || (validAmount(input.value) && Number(input.value) > 0))
  );
}
