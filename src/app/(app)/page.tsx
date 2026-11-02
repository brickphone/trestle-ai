import Link from "next/link";
import { loadData } from "@/lib/data/repository";
import { forecast, invoiceTotals } from "@/lib/forecast";
import { isLate, today } from "@/lib/finance";
import { formatUsd, formatDate } from "@/lib/format";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { ButtonLink } from "@/components/ui/button";
import { InvoiceList } from "@/components/product/invoice-list";
export default async function OverviewPage() {
  const data = await loadData();
  const invoices = data.invoices.filter(
    (i) => !i.voided_at && !["draft", "rejected"].includes(i.status),
  );
  const totals = invoices.map((i) => invoiceTotals(i, data.payments));
  const balance = data.balances.find((b) => !b.voided_at && !b.job_id);
  const result = forecast(data, balance?.as_of_date ?? today());
  const late = invoices.filter((i) =>
    isLate(i, invoiceTotals(i, data.payments).remaining, today()),
  );
  return (
    <>
      <PageHeader
        title="Overview"
        description="Your jobs, government receivables and projected cash position."
        actions={
          <ButtonLink href="/jobs" variant="primary">
            Manage jobs
          </ButtonLink>
        }
      />
      <PageBody>
        <StatGrid>
          <StatCard
            label="Active jobs"
            value={String(data.jobs.filter((j) => !j.voided_at && j.status === "active").length)}
          />
          <StatCard
            label="Government net outstanding"
            value={formatUsd(totals.reduce((s, t) => s + t.remaining, 0) / 100, { cents: true })}
          />
          <StatCard
            label="Retainage held"
            value={formatUsd(totals.reduce((s, t) => s + t.retainageHeld, 0) / 100, {
              cents: true,
            })}
          />
          <StatCard
            label="Lowest projected cash"
            value={formatUsd(result.hasBalance ? result.lowest.minimumCents / 100 : null, {
              cents: true,
            })}
            detail={
              result.hasBalance
                ? `Week ${result.lowest.index + 1} · ${formatDate(result.lowest.start)}`
                : "Opening balance needed"
            }
            footnote={
              <Link href="/forecast" className="text-accent underline">
                Estimate · View forecast sources
              </Link>
            }
          />
        </StatGrid>
        {!data.jobs.length && (
          <Panel title="Add your first job">
            <p className="mb-3">
              Your workspace is ready. Add a federal job, then a government invoice and recurring
              costs.
            </p>
            <ButtonLink href="/jobs">Add a job</ButtonLink>
          </Panel>
        )}
        <Panel title="Needs attention">
          <ul className="flex list-disc flex-col gap-2 pl-4">
            {late.map((i) => (
              <li key={i.id}>
                <Link href={`/invoices/${i.id}`} className="text-accent underline">
                  {i.invoice_number} is past due
                </Link>
              </li>
            ))}
            {data.invoices
              .filter((i) => !i.voided_at && i.status === "rejected")
              .map((i) => (
                <li key={i.id}>
                  <Link href={`/invoices/${i.id}`} className="text-accent underline">
                    {i.invoice_number} was rejected
                  </Link>
                </li>
              ))}
            {result.issues.map((issue, i) => (
              <li key={`issue-${i}`}>
                <Link href={issue.href} className="text-accent underline">
                  {issue.label}
                </Link>
              </li>
            ))}
            {!late.length &&
              !result.issues.length &&
              !data.invoices.some((i) => !i.voided_at && i.status === "rejected") && (
                <li>No issues found in entered records.</li>
              )}
          </ul>
        </Panel>
        <Panel title="Government invoices">
          <InvoiceList invoices={data.invoices} payments={data.payments} jobs={data.jobs} />
        </Panel>
      </PageBody>
    </>
  );
}
