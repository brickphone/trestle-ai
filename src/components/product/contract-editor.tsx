"use client";
import { useState, type FormEvent } from "react";
import { AwardSelection } from "./award-selection";
import { Button, ButtonLink } from "@/components/ui/button";
import { saveContracts } from "@/lib/data/actions";
import { cents } from "@/lib/finance";
import {
  defaultContractInput,
  validContractInput,
  type ContractInput,
} from "@/lib/onboarding/model";
import type { Lookup } from "@/lib/usaspending";
export function ContractEditor({
  result,
  asOf,
  selected: initial,
  inputs: initialInputs,
  organizationId,
}: {
  result: Extract<Lookup, { kind: "found" }>;
  asOf: string;
  selected: string[];
  inputs: Record<string, ContractInput>;
  organizationId: string;
}) {
  const [selected, setSelected] = useState(initial),
    [inputs, setInputs] = useState(initialInputs),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const valid = selected.every((id) => {
    const award = result.awards.find((a) => a.externalId === id);
    return !!award && validContractInput(award, inputs[id] ?? defaultContractInput(award, asOf));
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setPending(true);
    setMessage({});
    try {
      const form = new FormData();
      form.set("organization_id", organizationId);
      form.set(
        "contracts",
        JSON.stringify(
          result.awards.map((award) => {
            const input = inputs[award.externalId] ?? defaultContractInput(award, asOf);
            return selected.includes(award.externalId)
              ? {
                  id: award.externalId,
                  tracked: true,
                  billedCents: cents(input.billed),
                  paymentLagDays: Number(input.lag),
                  billedSource: input.estimated ? "schedule" : "manual",
                  ...((award.requiresContractValue ?? false) && input.value
                    ? { contractValueCents: cents(input.value) }
                    : {}),
                }
              : { id: award.externalId, tracked: false };
          }),
        ),
      );
      setMessage(await saveContracts({}, form));
    } catch {
      setMessage({ error: "Unable to save contracts. Please try again." });
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} data-contract-editor className="mx-auto w-full max-w-[720px] pb-8">
      <fieldset disabled={pending} className="min-w-0">
        <AwardSelection
          result={result}
          asOf={asOf}
          selection={selected}
          lockedIds={initial}
          quickInputs={inputs}
          onSelectionChange={setSelected}
          onQuickInputChange={(id, input) => setInputs({ ...inputs, [id]: input })}
        />
        <div className="mt-6 flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <ButtonLink href="/settings">Cancel</ButtonLink>
        </div>
      </fieldset>
      {message.error && (
        <p role="alert" className="mt-4 text-sm text-danger-strong">
          {message.error}
        </p>
      )}
      {message.success && (
        <p role="status" className="mt-4 text-sm text-success-strong">
          {message.success}
        </p>
      )}
    </form>
  );
}
