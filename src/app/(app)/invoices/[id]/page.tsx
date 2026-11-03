import Link from "next/link";
import { notFound } from "next/navigation";
import { loadData, recordHistory } from "@/lib/data/repository";
import { recordPayment, updateInvoiceTiming } from "@/lib/data/actions";
import { invoiceTotals } from "@/lib/forecast";
import { invoiceDueDate, isLate, today } from "@/lib/finance";
import { PAYMENT_RULES } from "@/lib/config";
import { Money, DateText } from "@/components/ui/financial";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel, DescriptionList } from "@/components/ui/panel";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { InvoiceForm } from "@/components/product/invoice-form";
import { ActionForm } from "@/components/product/action-form";
import { VoidForm } from "@/components/product/void-form";
import { Input, Options, Hidden } from "@/components/product/fields";
import { RecordTable, cell } from "@/components/product/record-table";
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const invoice = data.invoices.find((i) => i.id === id);
  if (!invoice) notFound();
  const job = data.jobs.find((j) => j.id === invoice.job_id);
  if (!job) notFound();
  const totals = invoiceTotals(invoice, data.payments);
  const due = invoiceDueDate(invoice);
  const history = await recordHistory(id);
  const readOnly = data.readOnly || !!invoice.voided_at || !!job.voided_at;
  return (
    <>
      <PageHeader
        title={invoice.invoice_number}
        breadcrumbs={[
          { label: "Government invoices", href: "/invoices" },
          { label: invoice.invoice_number },
        ]}
        description={`${job.contract_number} · ${invoice.status}`}
      />
      <PageBody>
        {invoice.voided_at && <p role="status">Voided: {invoice.void_reason}</p>}
        {isLate(invoice, totals.remaining, today()) && (
          <p
            role="status"
            className="border border-warning bg-warning-subtle p-3 text-warning-strong"
          >
            Past due ({due.confirmed ? "confirmed receipt basis" : "estimated submission basis"}).{" "}
            {PAYMENT_RULES.interestNote}{" "}
            <a href={PAYMENT_RULES.source} className="underline">
              Source
            </a>
          </p>
        )}
        <StatGrid>
          <StatCard label="Billed" value={<Money cents={invoice.billed_cents} whole />} />
          <StatCard label="Net due" value={<Money cents={totals.net} whole />} />
          <StatCard
            label="Progress payments received"
            value={<Money cents={totals.paid} whole />}
          />
          <StatCard label="Net outstanding" value={<Money cents={totals.remaining} whole />} />
          <StatCard label="Retainage held" value={<Money cents={totals.retainageHeld} whole />} />
        </StatGrid>
        <Panel title="Payment timing">
          <DescriptionList
            columns={2}
            items={[
              {
                label: "Due date",
                value: <DateText value={due.date} />,
                note: due.confirmed
                  ? "Confirmed proper-request receipt basis"
                  : "Estimated submission basis",
              },
              {
                label: "Expected receipt",
                value: <DateText value={invoice.expected_payment_date} />,
                note: "Forecast override; does not change due date.",
              },
              { label: "Terms snapshot", value: `${invoice.payment_terms_days} calendar days` },
              {
                label: "Proper request received",
                value: <DateText value={invoice.proper_receipt_date} />,
              },
            ]}
          />
          <p className="mt-3 text-sm text-fg-muted">
            {PAYMENT_RULES.progressNote}{" "}
            <a href={PAYMENT_RULES.source} className="text-accent underline">
              Verify against your contract
            </a>
            .
          </p>
          {invoice.resubmission_of_id && (
            <Link
              href={`/invoices/${invoice.resubmission_of_id}`}
              className="text-accent underline"
            >
              Original rejected invoice
            </Link>
          )}
        </Panel>
        {invoice.status !== "rejected" && (
          <Panel title="Update payment timing">
            <ActionForm action={updateInvoiceTiming} label="Save timing" readOnly={readOnly}>
              <Hidden name="invoice_id" value={id} />
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  name="expected_payment_date"
                  label="Updated expected payment date"
                  type="date"
                  value={invoice.expected_payment_date}
                />
                <Input
                  name="expected_retainage_date"
                  label="Updated expected retainage receipt date"
                  type="date"
                  value={invoice.expected_retainage_date}
                />
                <Input
                  name="proper_receipt_date"
                  label="Confirmed proper-request receipt date"
                  type="date"
                  value={invoice.proper_receipt_date}
                />
              </div>
            </ActionForm>
          </Panel>
        )}
        {invoice.status === "rejected" ? (
          <>
            <Panel title="Rejected invoice">
              <p>{invoice.rejection_reason}</p>
              <p className="mt-2 text-sm text-fg-muted">
                This record remains rejected. Resubmit as a new invoice below.
              </p>
            </Panel>
            <Panel title="Resubmit invoice">
              <InvoiceForm jobs={[job]} resubmission={invoice} readOnly={readOnly} />
            </Panel>
          </>
        ) : (
          <Panel title="Invoice details">
            <InvoiceForm
              jobs={[job]}
              invoice={invoice}
              readOnly={readOnly || invoice.status === "paid"}
            />
          </Panel>
        )}
        {["submitted", "accepted", "paid"].includes(invoice.status) && (
          <Panel title="Record payment received">
            <ActionForm action={recordPayment} label="Record payment" readOnly={readOnly}>
              <Hidden name="invoice_id" value={id} />
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  name="received_date"
                  label="Payment received date"
                  type="date"
                  value={today()}
                  max={today()}
                  required
                />
                <Input name="amount_cents" label="Payment amount ($)" required />
                <Options
                  name="kind"
                  label="Payment type"
                  value={totals.remaining === 0 ? "retainage" : "progress"}
                >
                  <option value="progress">Progress payment</option>
                  <option value="retainage">Retainage receipt</option>
                </Options>
                <Input name="reference" label="Payment reference" />
              </div>
              <p className="text-sm text-fg-muted">
                Partial payments are supported. Amounts cannot exceed the remaining balance.
              </p>
            </ActionForm>
          </Panel>
        )}
        <Panel title="Payment history">
          <RecordTable label="Payments" headers={["Date", "Type", "Amount", "Reference", "State"]}>
            {data.payments
              .filter((p) => p.invoice_id === id)
              .map((p) => (
                <tr id={`payment-${p.id}`} key={p.id}>
                  <td className={cell}>{<DateText value={p.received_date} />}</td>
                  <td className={cell}>{p.kind}</td>
                  <td className={cell}>{<Money cents={p.amount_cents} />}</td>
                  <td className={cell}>{p.reference ?? "Not available"}</td>
                  <td className={cell}>
                    {p.voided_at ? (
                      `Voided: ${p.void_reason}`
                    ) : (
                      <VoidForm kind="payment" id={p.id} readOnly={readOnly} />
                    )}
                  </td>
                </tr>
              ))}
          </RecordTable>
        </Panel>
        <Panel title="Invoice audit history">
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="text-sm">
                <details>
                  <summary className="cursor-pointer">
                    {h.created_at.toISOString()} · {h.operation} ·{" "}
                    {data.organization.is_demo
                      ? "Demo actor"
                      : (h.actor_id ?? "Administrative script")}
                  </summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify({ before: h.before_value, after: h.after_value }, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Void invoice">
          <VoidForm kind="invoice" id={id} readOnly={readOnly} />
        </Panel>
      </PageBody>
    </>
  );
}
