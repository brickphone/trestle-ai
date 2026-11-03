import Link from "next/link";
import type { Invoice, Payment, Job } from "@/lib/data/types";
import { invoiceTotals } from "@/lib/forecast";
import { invoiceDueDate, isLate, today } from "@/lib/finance";
import { Money, DateText } from "@/components/ui/financial";
import { Status } from "@/components/ui/badge";
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
                <Status value={i.status} />
                {isLate(i, totals.remaining, today()) && (
                  <span className="ml-2 font-medium text-warning-strong">Past due</span>
                )}
              </td>
              <td className={cell}>
                <Money cents={i.billed_cents} />
              </td>
              <td className={cell}>
                <Money cents={totals.remaining} />
              </td>
              <td className={cell}>
                <Money cents={totals.retainageHeld} />
              </td>
              <td className={cell}>
                <DateText value={due.date} />
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
