import { saveJob } from "@/lib/data/actions";
import { PAYMENT_RULES } from "@/lib/config";
import { statusLabel } from "@/lib/status-label";
import type { Job } from "@/lib/data/types";
import { ActionForm } from "./action-form";
import { Input, Notes, Options, Hidden, dollars } from "./fields";
export function JobForm({ job, readOnly = false }: { job?: Job; readOnly?: boolean }) {
  return (
    <div className="w-full max-w-[600px]">
      <ActionForm action={saveJob} label={job ? "Save job" : "Add job"} readOnly={readOnly}>
        {job && <Hidden name="id" value={job.id} />}
        <Input
          name="contract_number"
          label="Contract number"
          value={job?.contract_number}
          required
        />
        <Input name="agency" label="Agency" value={job?.agency} />
        <Notes name="description" label="Job name / description" value={job?.description} />
        <Input
          name="contract_value_cents"
          label="Contract value ($)"
          value={dollars(job?.contract_value_cents)}
          hint="Editing this value overrides the forecast billing value. Public obligations remain separate."
        />
        <Options name="status" label="Job status" value={job?.status ?? "active"}>
          {["planned", "active", "complete", "closed"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Options>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input name="start_date" label="Start date" type="date" value={job?.start_date} />
          <Input name="end_date" label="End date" type="date" value={job?.end_date} />
        </div>
        <Input
          name="retainage_bps"
          label="Government retainage (%)"
          type="number"
          step="0.01"
          min={0}
          max={100}
          value={(job?.retainage_bps ?? PAYMENT_RULES.governmentRetainageBps) / 100}
          hint={PAYMENT_RULES.verify}
        />
        <Input
          name="payment_terms_days"
          label="Progress payment terms (days)"
          type="number"
          min={0}
          max={365}
          value={job?.payment_terms_days ?? PAYMENT_RULES.progressDays}
          hint={PAYMENT_RULES.verify}
        />
        <p className="text-xs text-fg-muted">
          <a href={PAYMENT_RULES.source} className="text-accent underline">
            FAR 52.232-27
          </a>
          : {PAYMENT_RULES.progressNote}{" "}
          <a href={PAYMENT_RULES.retainageSource} className="text-accent underline">
            FAR 52.232-5(e)
          </a>
          : satisfactory progress is paid in full; verify any withholding against your contract.
        </p>
      </ActionForm>
    </div>
  );
}
