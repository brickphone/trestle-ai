"use client";
import { readableCase } from "@/lib/display-case";
import { useState } from "react";
import { isUmbrella, preselectedAwards, sentenceDescription } from "@/lib/onboarding/model";
import type { Award, Lookup } from "@/lib/usaspending";
import { loadOlderAwards } from "@/lib/usaspending/actions";
import { awardStatus, sortAwards } from "@/lib/usaspending/presentation";
import { formatDate, formatDateIso, parseDate } from "@/lib/format";
import { Money } from "@/components/ui/financial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "./money-input";
import { FORECAST_DEFAULTS } from "@/lib/config";
import { Checkbox, Field, TextInput } from "@/components/ui/form";

type Found = Extract<Lookup, { kind: "found" }>;
export function OnboardingDate({ value }: { value: string | null }) {
  return parseDate(value) ? (
    <time dateTime={formatDateIso(value)}>{formatDate(value)}</time>
  ) : (
    <span>Not available</span>
  );
}
export function AwardSelection({
  result,
  asOf,
  selection,
  onSelectionChange,
  onLoaded,
  quickInputs,
  onQuickInputChange,
}: {
  result: Found;
  asOf: string;
  selection?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onLoaded?: (result: Found) => void;
  quickInputs?: Record<string, { billed: string; lag: string }>;
  onQuickInputChange?: (id: string, input: { billed: string; lag: string }) => void;
}) {
  const [loaded, setLoaded] = useState(result);
  const [selected, setSelected] = useState(
    () => new Set(selection ?? preselectedAwards(result.awards, asOf)),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const awards = sortAwards(loaded.awards);
  const umbrella = awards.filter(isUmbrella);
  const work = awards.filter((a) => !isUmbrella(a));
  const active = work.filter((a) => awardStatus(a, asOf) === "Active");
  const completed = work.filter((a) => awardStatus(a, asOf) === "Completed");
  const unknown = work.filter((a) => awardStatus(a, asOf) === "Status unavailable");
  const row = (award: Award) => (
    <li
      key={award.externalId}
      className="relative rounded border border-border p-4 has-[:checked]:border-accent has-[:checked]:bg-surface-muted"
      data-award-id={award.externalId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Checkbox
          style={{ position: "relative", zIndex: 10 }}
          name="award"
          value={award.externalId}
          label={
            <span className="after:absolute after:inset-0 after:cursor-pointer">
              {sentenceDescription(award.description) ?? "Description not available"}
            </span>
          }
          checked={selected.has(award.externalId)}
          onChange={(event) => {
            const next = new Set(selected);
            if (event.target.checked) next.add(award.externalId);
            else next.delete(award.externalId);
            setSelected(next);
            onSelectionChange?.([...next]);
          }}
        />
        <Badge>{awardStatus(award, asOf)}</Badge>
      </div>
      <div className="mt-2 flex flex-col gap-1 pl-6">
        <p className="text-xs text-fg-muted">{award.contractNumber}</p>
        <p className="text-xs text-fg-muted">
          {award.agency ?? "Agency not available"} · Place of performance:{" "}
          {readableCase(award.placeOfPerformanceCity) ?? "Not available"},{" "}
          {award.placeOfPerformanceState ?? "Not available"}
        </p>
        <p className="text-xs text-fg-muted">
          Period of performance: <OnboardingDate value={award.startDate} /> –{" "}
          <OnboardingDate value={award.endDate} />
        </p>
        <p className="text-xs text-fg-muted">
          Obligated amount: <Money cents={award.obligationsCents} />
        </p>
        <div className="flex flex-wrap gap-4 text-xs">
          <a href={award.sourceUrl} className="relative z-10 text-accent underline">
            View on USAspending
          </a>
          {award.parentAwardUrl && (
            <a href={award.parentAwardUrl} className="relative z-10 text-accent underline">
              Parent award {award.parentAwardId ?? "Not available"}
            </a>
          )}
        </div>
        {selected.has(award.externalId) &&
          quickInputs &&
          (() => {
            const input = quickInputs[award.externalId] ?? {
              billed: "0",
              lag: String(FORECAST_DEFAULTS.paymentLagDays),
            };
            return (
              <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  htmlFor={`billed-${award.externalId}`}
                  label="Billed so far"
                  hint="Opening billed total before tracking invoices here. Default $0; verify this amount."
                >
                  <div className="relative">
                    <span className="absolute top-2 left-3 text-fg-subtle" aria-hidden="true">
                      $
                    </span>
                    <MoneyInput
                      className="pl-7"
                      id={`billed-${award.externalId}`}
                      value={input.billed}
                      onValueChange={(billed) =>
                        onQuickInputChange?.(award.externalId, { ...input, billed })
                      }
                    />
                  </div>
                </Field>
                <Field
                  htmlFor={`lag-${award.externalId}`}
                  label="Usual days until the government pays"
                  hint="Expected receipt lag after monthly billing; editable on the job."
                >
                  <TextInput
                    id={`lag-${award.externalId}`}
                    type="number"
                    min={0}
                    max={36500}
                    value={input.lag}
                    onChange={(e) =>
                      onQuickInputChange?.(award.externalId, { ...input, lag: e.target.value })
                    }
                  />
                </Field>
              </div>
            );
          })()}
      </div>
    </li>
  );
  return (
    <div className="flex flex-col gap-5" data-award-selection>
      <input type="hidden" name="include_older" value={loaded.hasOlder ? "0" : "1"} />
      <p className="text-sm text-fg-muted">
        {loaded.totalAwards} awards found ·{" "}
        {awards.filter((a) => awardStatus(a, asOf) === "Active").length} active ·{" "}
        {loaded.hasOlder ? "showing those ending in the last 2 years" : "showing all awards"}
      </p>
      <p role="status" className="text-xs text-fg-subtle">
        Showing {awards.length} of {loaded.totalAwards} awards · All {loaded.searchPages} search{" "}
        {loaded.searchPages === 1 ? "page" : "pages"} checked.
      </p>
      <p className="text-xs text-fg-subtle">
        Active means the performance end date is today or later; it does not confirm agency
        closeout. Completed contracts are not selected automatically.
      </p>
      <section aria-label="Active awards">
        <h3 className="text-md font-medium">Active ({active.length})</h3>
        {active.length ? (
          <ul className="mt-3 flex flex-col gap-3">{active.map(row)}</ul>
        ) : (
          <p className="py-3 text-sm text-fg-muted">
            No active federal contracts found; you can add a job manually
          </p>
        )}
      </section>
      {completed.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer text-sm font-medium">
            Past contracts ({completed.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">{completed.map(row)}</ul>
        </details>
      )}
      {umbrella.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Umbrella contracts (no work ordered yet) ({umbrella.length})
          </summary>
          <p className="mt-2 text-xs text-fg-muted">
            These awards have zero obligations or describe an umbrella agreement or minimum
            guarantee. They may not represent ordered work; verify against your contract.
          </p>
          <ul className="mt-3 flex flex-col gap-3">{umbrella.map(row)}</ul>
        </details>
      )}
      {unknown.length > 0 && (
        <details>
          <summary className="w-fit cursor-pointer text-sm font-medium">
            Status unavailable ({unknown.length})
          </summary>
          <p className="mt-2 text-xs text-fg-subtle">
            Performance end dates are missing. These awards are not selected automatically.
          </p>
          <ul>{unknown.map(row)}</ul>
        </details>
      )}
      {loaded.hasOlder && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-fg-subtle">
            Completed awards ending before <OnboardingDate value={loaded.cutoff} /> are hidden.
          </p>
          <Button
            type="button"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                const older = await loadOlderAwards(result.uei);
                if (older.kind !== "found") setError(older.message);
                else {
                  setLoaded(older);
                  onLoaded?.(older);
                }
              } catch {
                setError(
                  "Older awards could not be loaded. Your current selection is unchanged. Try again.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "Loading older awards…" : "Show older awards"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-strong">
          {error}
        </p>
      )}
    </div>
  );
}
