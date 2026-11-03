"use client";
import Link from "next/link";
import { useActionState } from "react";
import { useBilledEstimate } from "@/lib/data/actions";
import { Money } from "@/components/ui/financial";
import { Button } from "@/components/ui/button";
export function BilledEstimateNotice({
  jobId,
  estimateCents,
  readOnly = false,
}: {
  jobId: string;
  estimateCents: number | null;
  readOnly?: boolean;
}) {
  const [state, submit, pending] = useActionState(useBilledEstimate, {});
  return (
    <div
      className="mt-2 flex flex-col items-start gap-2"
      data-billed-estimate={jobId}
      data-estimate-cents={estimateCents ?? ""}
      data-read-only={readOnly ? "true" : "false"}
    >
      {estimateCents !== null && (
        <p className="text-sm text-fg-muted">
          Suggested billed so far: <Money cents={estimateCents} whole />{" "}
          <span className="text-xs text-fg-subtle">· Estimated from schedule, please check.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {estimateCents !== null && (
          <form action={submit}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="expected_estimate_cents" value={estimateCents} />
            <Button type="submit" disabled={readOnly || pending}>
              {pending ? "Saving…" : "Use estimate"}
            </Button>
          </form>
        )}
        <Link href={`/jobs/${jobId}#billed-actual`} className="text-sm text-accent underline">
          Enter actual
        </Link>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger-strong">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm text-success-strong">
          Estimate saved. Refreshing the forecast.
        </p>
      )}
    </div>
  );
}
