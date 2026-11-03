import Link from "next/link";
import type { loadData } from "@/lib/data/repository";
import { viewDemo } from "@/lib/auth/actions";
import { forecast, invoiceTotals, type CashSource } from "@/lib/forecast";
import { addDays, isLate, today } from "@/lib/finance";
import { PageBody } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Button, ButtonLink } from "@/components/ui/button";
import { EstimateBadge } from "@/components/ui/badge";
import { Money, DateText } from "@/components/ui/financial";
import { InvoiceList } from "./invoice-list";
import { CashChart } from "./cash-chart";

function Upcoming({
  title,
  sources,
  note,
  data,
}: {
  title: string;
  sources: CashSource[];
  note?: string;
  data: Awaited<ReturnType<typeof loadData>>;
}) {
  const sourcesId = title === "Money in" ? "money-in-sources" : "money-out-sources";
  return (
    <section className="min-w-0 border-t border-border pt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-md font-medium">{title}</h2>
        <a
          href={`#${sourcesId}`}
          title="View source entries"
          className="text-lg font-medium hover:underline"
        >
          <Money
            cents={
              sources.reduce((sum, s) => sum + Math.abs(s.amountCents), 0) *
              (title === "Money out" ? -1 : 1)
            }
            whole
          />
        </a>
      </div>
      <p className="mb-4 text-xs text-fg-subtle">Next 30 days · Estimate</p>
      {sources.length ? (
        <ul id={sourcesId}>
          {sources.map((s) => {
            const invoice = s.href.startsWith("/invoices/")
              ? data.invoices.find((i) => s.href === `/invoices/${i.id}`)
              : undefined;
            const cost = data.costs.find((c) => s.href === `/settings#cost-${c.id}`);
            const job = data.jobs.find(
              (j) =>
                j.id === (invoice?.job_id ?? cost?.job_id) || s.href.startsWith(`/jobs/${j.id}#`),
            );
            return (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className="flex items-center gap-4 border-b border-border py-3 hover:bg-surface-hover"
                >
                  <span className="w-12 shrink-0 text-xs text-fg-subtle">
                    <DateText value={s.date} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-accent">
                      {invoice
                        ? `${invoice.invoice_number}${s.id.endsWith("retainage") ? " · retainage" : ""}`
                        : s.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-fg-subtle">
                      {job
                        ? `${job.agency ?? "Agency not available"} · ${job.contract_number}`
                        : "Company-wide"}
                    </span>
                  </span>
                  <Money
                    cents={s.amountCents}
                    whole
                    className={title === "Money in" ? "text-success-strong" : undefined}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p id={sourcesId} className="py-4 text-sm text-fg-muted">
          No {title === "Money in" ? "expected receipts" : "scheduled payments"}.
        </p>
      )}
      {note && <p className="mt-3 text-xs text-fg-subtle">{note}</p>}
    </section>
  );
}

export function OverviewContent({ data }: { data: Awaited<ReturnType<typeof loadData>> }) {
  const date = today();
  const balance = data.balances.find((b) => !b.voided_at && !b.job_id);
  const result = forecast(data, balance?.as_of_date ?? date);
  const jobs = data.jobs.filter((j) => !j.voided_at);
  const late = data.invoices.filter(
    (i) =>
      !i.voided_at &&
      !["draft", "rejected"].includes(i.status) &&
      isLate(i, invoiceTotals(i, data.payments).remaining, date),
  );
  const attention = [
    ...late.map((i) => ({ label: `${i.invoice_number} is past due`, href: `/invoices/${i.id}` })),
    ...data.invoices
      .filter((i) => !i.voided_at && i.status === "rejected")
      .map((i) => ({ label: `${i.invoice_number} was rejected`, href: `/invoices/${i.id}` })),
    ...result.issues,
  ];
  const upcoming = result.sources
    .filter(
      (s) => s.date >= date && s.date <= addDays(date, 29) && s.kind !== "opening" && s.estimate,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const firstRun = (
    <section className="rounded-md bg-surface-muted p-6 lg:p-8">
      <p className="mb-2 text-xs font-medium text-fg-subtle">Your workspace is ready</p>
      <h2 className="mb-3 text-xl font-medium">Add your first job</h2>
      <p className="max-w-lg text-fg-muted">
        Start with a federal contract, then add an invoice, an opening balance and your recurring
        costs to see your cash outlook.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ButtonLink href="/jobs" variant="primary">
          Add your first job
        </ButtonLink>
        <form action={viewDemo}>
          <Button type="submit" variant="ghost">
            Explore the demo company
          </Button>
        </form>
      </div>
    </section>
  );
  return (
    <>
      <h1 className="sr-only">Overview</h1>
      <div className="pt-8">
        <PageBody>
          {result.hasActiveJobs && !result.hasIncoming && (
            <p role="status" className="border-l-2 border-warning p-3 text-sm text-warning-strong">
              Your forecast has no incoming payments. Add invoices or check your jobs’ billing
              details.{" "}
              <Link href="/jobs" className="underline">
                Review jobs
              </Link>
            </p>
          )}
          {!result.hasBalance && (
            <p role="status" className="border-l-2 border-warning p-3 text-sm text-warning-strong">
              Opening balance missing.{" "}
              <Link href="/settings#balances" className="underline">
                Add your opening bank balance
              </Link>{" "}
              to see projected cash.
            </p>
          )}

          {!jobs.length && !balance ? (
            firstRun
          ) : (
            <>
              <section aria-label="Cash outlook" className="border-b border-border pb-6">
                <div className="cash-hero">
                  <div>
                    <h2 className="text-sm font-medium text-fg-muted">Cash today</h2>
                    <p className="cash-hero-money">
                      <Link
                        href={balance ? `/settings#balance-${balance.id}` : "/settings#balances"}
                        className="hover:underline"
                      >
                        <Money cents={balance?.amount_cents} whole />
                      </Link>
                    </p>
                    <p className="mt-2 text-xs text-fg-subtle">
                      {balance ? (
                        <>
                          Opening bank balance · As of <DateText value={balance.as_of_date} />
                        </>
                      ) : (
                        <Link className="text-accent underline" href="/settings#balances">
                          Add an opening bank balance
                        </Link>
                      )}
                    </p>
                  </div>
                  <div>
                    <h2 className="text-sm font-medium text-fg-muted">Lowest projected cash</h2>
                    <p className="cash-hero-money">
                      <Link
                        href={`/forecast#week-${result.lowest.index}-sources`}
                        className="hover:underline"
                      >
                        <Money
                          cents={result.hasBalance ? result.lowest.minimumCents : null}
                          whole
                        />
                      </Link>
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                      {result.hasBalance && (
                        <>
                          Week {result.lowest.index + 1} ·{" "}
                          <DateText value={result.lowest.minimumDay} />
                          <span aria-hidden>·</span>
                        </>
                      )}
                      <EstimateBadge />
                    </p>
                  </div>
                </div>
                <CashChart result={result} />
              </section>
              {balance && balance.as_of_date < date && (
                <p className="text-sm text-fg-muted">
                  This projection starts at the balance date.{" "}
                  <Link className="text-accent underline" href="/settings#balances">
                    Update your opening balance
                  </Link>{" "}
                  for a current view.
                </p>
              )}
              <div className="grid min-w-0 gap-8 lg:grid-cols-2">
                <Upcoming
                  title="Money in"
                  data={data}
                  sources={upcoming.filter((s) => s.kind === "receipt")}
                />
                <Upcoming
                  title="Money out"
                  data={data}
                  sources={upcoming.filter((s) => s.kind === "cost")}
                  note="Projected job costs and office overhead are separate. Entered job costs replace that job’s cost model. Subcontractor payables are not included."
                />
              </div>
              {!jobs.length && firstRun}
              {attention.length > 0 && (
                <Panel title="Needs attention">
                  <ul className="divide-y divide-border">
                    {attention.map((item, index) => (
                      <li key={`${item.href}-${index}`} className="py-3">
                        <Link href={item.href} className="text-accent underline underline-offset-2">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
              <Panel
                title="Recent invoices"
                actions={
                  <Link href="/invoices" className="text-sm text-accent hover:underline">
                    View all invoices
                  </Link>
                }
              >
                <InvoiceList
                  invoices={[...data.invoices]
                    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
                    .filter((i) => !i.voided_at)
                    .slice(0, 5)}
                  payments={data.payments}
                  jobs={data.jobs}
                />
              </Panel>
            </>
          )}
        </PageBody>
      </div>
    </>
  );
}
