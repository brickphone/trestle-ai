import { statusLabel } from "@/lib/status-label";
import { saveInvoice } from "@/lib/data/actions";
import type { Invoice, Job } from "@/lib/data/types";
import { ActionForm } from "./action-form";
import { Input, Notes, Options, Hidden, dollars } from "./fields";
export function InvoiceForm({
  jobs,
  invoice,
  jobId,
  resubmission,
  readOnly = false,
}: {
  jobs: Job[];
  invoice?: Invoice;
  jobId?: string;
  resubmission?: Invoice;
  readOnly?: boolean;
}) {
  const original = invoice ?? resubmission;
  return (
    <ActionForm
      action={saveInvoice}
      label={invoice ? "Save invoice" : "Add invoice"}
      readOnly={readOnly}
    >
      {invoice && <Hidden name="id" value={invoice.id} />}
      {resubmission && <Hidden name="resubmission_of_id" value={resubmission.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <Options name="job_id" label="Job" value={original?.job_id ?? jobId}>
          {jobs
            .filter((j) => !j.voided_at)
            .map((j) => (
              <option key={j.id} value={j.id}>
                {j.contract_number}
              </option>
            ))}
        </Options>
        <Input
          name="invoice_number"
          label="Invoice number"
          value={invoice?.invoice_number ?? ""}
          required
        />
        <Input
          name="period_start"
          label="Billing period start"
          type="date"
          value={original?.period_start}
          required
        />
        <Input
          name="period_end"
          label="Billing period end"
          type="date"
          value={original?.period_end}
          required
        />
        <Input
          name="billed_cents"
          label="Amount billed ($)"
          value={dollars(original?.billed_cents)}
          required
        />
        <Input
          name="retainage_cents"
          label="Retainage withheld ($)"
          value={invoice ? dollars(invoice.retainage_cents) : "0"}
          hint="Verify against your contract. Defaults to no government retainage."
        />
        <Input
          name="submitted_date"
          label="Submitted date"
          type="date"
          value={invoice?.submitted_date}
        />
        <Input
          name="proper_receipt_date"
          label="Proper-request receipt date"
          type="date"
          value={invoice?.proper_receipt_date}
          hint="Confirms the due-date basis. Leave blank if not known."
        />
        <Input
          name="expected_payment_date"
          label="Expected payment date"
          type="date"
          value={invoice?.expected_payment_date}
          hint="Forecast date; does not change the contractual due date."
        />
        <Input
          name="expected_retainage_date"
          label="Expected retainage receipt date"
          type="date"
          value={invoice?.expected_retainage_date}
        />
        <Options name="portal" label="Submission portal" value={invoice?.portal ?? "other"}>
          {["WAWF/PIEE", "IPP", "other"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Options>
        <Options
          name="status"
          label="Invoice status"
          value={invoice?.status === "paid" ? "accepted" : (invoice?.status ?? "draft")}
        >
          {["draft", "submitted", "accepted", "rejected"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Options>
      </div>
      <Notes name="rejection_reason" label="Rejection reason" value={invoice?.rejection_reason} />
      <p className="text-sm text-fg-muted">
        Record payment receipts on the invoice detail. A resubmission creates a new invoice.
      </p>
    </ActionForm>
  );
}
