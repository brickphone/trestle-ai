import type { loadData } from "@/lib/data/repository";
import type { Lookup, Award, lookupUei } from "@/lib/usaspending";
import { jobObligations } from "@/lib/job-values";
import { emptyDraft, defaultContractInput, type OnboardingDraft } from "./model";
import { FORECAST_DEFAULTS } from "@/lib/config";
export type SetupData = Awaited<ReturnType<typeof loadData>>;
export function companySetupSeed(data: SetupData, asOf: string) {
  const jobs = data.jobs.filter((j) => !j.voided_at);
  const awards: Award[] = jobs.map((job) => {
    const snapshot = data.snapshots.find((s) => s.id === job.source_snapshot_id);
    const original = snapshot?.original as Record<string, unknown> | undefined;
    return {
      externalId: job.id,
      contractNumber: job.contract_number,
      rawContractNumber: job.contract_number,
      isTaskOrder: original?.isTaskOrder === true,
      parentAwardId: typeof original?.parentAwardId === "string" ? original.parentAwardId : null,
      parentAwardUrl: typeof original?.parentAwardUrl === "string" ? original.parentAwardUrl : null,
      agency: job.agency,
      description: job.description,
      displayDescription: job.description,
      startDate: job.start_date,
      endDate: job.end_date,
      contractValueCents: job.contract_value_cents,
      obligationsCents: jobObligations(job, snapshot),
      requiresContractValue:
        jobObligations(job, snapshot) === null &&
        !(typeof original?.contractValueCents === "number" && original.contractValueCents > 0),
      placeOfPerformanceCity:
        typeof original?.placeOfPerformanceCity === "string"
          ? original.placeOfPerformanceCity
          : null,
      placeOfPerformanceState:
        typeof original?.placeOfPerformanceState === "string"
          ? original.placeOfPerformanceState
          : null,
      sourceUrl: snapshot?.source_url ?? `/jobs/${job.id}`,
    };
  });
  const balance = data.balances.find((b) => !b.voided_at && !b.job_id);
  const managed = (frequency: string, labels: string[]) =>
    data.costs
      .filter(
        (c) =>
          !c.voided_at &&
          !c.job_id &&
          c.cost_scope === "overhead" &&
          c.frequency === frequency &&
          labels.includes(c.label) &&
          c.start_date <= asOf &&
          (!c.end_date || c.end_date >= asOf),
      )
      .reduce((sum, c) => sum + c.amount_cents, 0);
  const amount = (value: number) => String(value / 100);
  const initial: OnboardingDraft = {
    ...emptyDraft(asOf),
    editingOrganizationId: data.organization.id,
    uei: data.organization.uei ?? "",
    manual: !data.organization.uei,
    name: data.organization.name,
    selected: jobs.filter((j) => j.is_tracked !== false).map((j) => j.id),
    furthestStep: 4,
    balance: balance ? amount(balance.amount_cents) : "",
    asOf: balance?.as_of_date ?? asOf,
    payroll: amount(managed("weekly", ["Weekly office payroll"])),
    monthly: amount(managed("monthly", ["Monthly overhead", "Other monthly costs"])),
    awardInputs: Object.fromEntries(
      jobs.map((j) => {
        const input = data.assumptions.find((a) => a.job_id === j.id);
        return [
          j.id,
          {
            ...defaultContractInput(
              awards.find((a) => a.externalId === j.id)!,
              asOf,
            ),
            ...(input?.billed_source === "manual" || (input?.billed_before_tracking_cents ?? 0) > 0
              ? {
                  billed: amount(input!.billed_before_tracking_cents!),
                  estimated: input?.billed_source === "schedule",
                }
              : {}),
            value:
              (input?.value_override_cents ?? j.contract_value_cents) != null
                ? amount((input?.value_override_cents ?? j.contract_value_cents)!)
                : "",
            lag: String(input?.payment_lag_days ?? FORECAST_DEFAULTS.paymentLagDays),
          },
        ];
      }),
    ),
  };
  const result: Extract<Lookup, { kind: "found" }> = {
    kind: "found",
    name: data.organization.name,
    uei: data.organization.uei ?? "",
    awards,
    totalAwards: awards.length,
    hasOlder: false,
    searchPages: 0,
    cutoff: asOf,
  };
  return { initial, result };
}
/** Refresh missing legacy obligations for display without rewriting their source snapshot. */
export async function refreshMissingObligations(
  data: SetupData,
  asOf: string,
  lookup: typeof lookupUei,
) {
  if (!data.organization.uei) return data;
  const missing = data.jobs.filter(
    (j) =>
      !j.voided_at &&
      jobObligations(
        j,
        data.snapshots.find((s) => s.id === j.source_snapshot_id),
      ) === null &&
      j.source_snapshot_id,
  );
  const ids = missing
    .map((j) => data.snapshots.find((s) => s.id === j.source_snapshot_id)?.external_id)
    .filter((id): id is string => !!id);
  if (!ids.length) return data;
  const found = await lookup(data.organization.uei, fetch, {
    asOfDate: asOf,
    selectedAwardIds: ids,
  });
  if (found.kind !== "found") return data;
  return {
    ...data,
    jobs: data.jobs.map((j) => {
      if (!missing.some((m) => m.id === j.id)) return j;
      const snapshot = data.snapshots.find((s) => s.id === j.source_snapshot_id);
      const award = found.awards.find((a) => a.externalId === snapshot?.external_id);
      return award?.obligationsCents != null
        ? { ...j, obligated_cents: award.obligationsCents }
        : j;
    }),
  };
}
