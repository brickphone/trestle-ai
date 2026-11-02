import Link from "next/link";
import type { Invoice, Payment, Job } from "@/lib/db/schema";
import { invoiceTotals } from "@/lib/forecast";
import { invoiceDueDate, isLate, today } from "@/lib/finance";
import { formatUsd, formatDate } from "@/lib/format";
import { RecordTable, cell, link } from "./record-table";
export function InvoiceList({
  invoices,
  payments,
  jobs,
}: {
  invoices: Invoice[];
  payments: Payment[];
  jobs: Job[];
}) {
  return (
    <RecordTable
      label="Government invoices"
      headers={[
        "Invoice",
        "Job",
        "Status",
        "Billed",
        "Net outstanding",
        "Retainage held",
        "Due date",
      ]}
    >
      {invoices
        .filter((i) => !i.voided_at)
        .map((i) => {
          const totals = invoiceTotals(i, payments),
            due = invoiceDueDate(i);
          return (
            <tr key={i.id}>
              <td className={cell}>
                <Link className={link} href={`/invoices/${i.id}`}>
                  {i.invoice_number}
                </Link>
              </td>
              <td className={cell}>
                {jobs.find((j) => j.id === i.job_id)?.contract_number ?? "Not available"}
              </td>
              <td className={cell}>
                {i.status}
                {isLate(i, totals.remaining, today()) && (
                  <span className="ml-2 font-medium text-danger-strong">Past due</span>
                )}
              </td>
              <td className={cell}>{formatUsd(i.billed_cents / 100, { cents: true })}</td>
              <td className={cell}>{formatUsd(totals.remaining / 100, { cents: true })}</td>
              <td className={cell}>{formatUsd(totals.retainageHeld / 100, { cents: true })}</td>
              <td className={cell}>
                {formatDate(due.date)}
                {due.date && (
                  <span className="block text-xs text-fg-subtle">
                    {due.confirmed ? "Confirmed basis" : "Estimated basis"}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      {invoices.filter((i) => !i.voided_at).length === 0 && (
        <tr>
          <td colSpan={7} className={cell}>
            No invoices added yet.
          </td>
        </tr>
      )}
    </RecordTable>
  );
}
