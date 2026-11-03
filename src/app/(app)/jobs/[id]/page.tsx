import Link from "next/link";
import { notFound } from "next/navigation";
import { loadData, recordHistory } from "@/lib/data/repository";
import { effectiveValue, invoiceTotals } from "@/lib/forecast";
import { saveChange, saveAssumptions } from "@/lib/data/actions";
import { Money, DateText } from "@/components/ui/financial";
import { Status } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel, DescriptionList } from "@/components/ui/panel";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { JobForm } from "@/components/product/job-form";
import { InvoiceForm } from "@/components/product/invoice-form";
import { InvoiceList } from "@/components/product/invoice-list";
import { ActionForm } from "@/components/product/action-form";
import { VoidForm } from "@/components/product/void-form";
import { Input, Notes, Options, Hidden, dollars } from "@/components/product/fields";
import { RecordTable, cell } from "@/components/product/record-table";
import { Checkbox } from "@/components/ui/form";
import { FORECAST_DEFAULTS } from "@/lib/config";
import { today } from "@/lib/finance";
export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadData();
  const job = data.jobs.find((j) => j.id === id);
  if (!job) notFound();
  const invoices = data.invoices.filter(
    (i) => i.job_id === id && !i.voided_at && !["draft", "rejected"].includes(i.status),
  );
  const changes = data.changes.filter((c) => c.job_id === id && !c.voided_at);
  const assumptions = data.assumptions.find((a) => a.job_id === id);
  const history = await recordHistory(id);
  const value = effectiveValue(job, data.changes);
  const totals = invoices.map((i) => invoiceTotals(i, data.payments));
  const snapshot = data.snapshots.find((s) => s.id === job.source_snapshot_id);
  const readOnly = data.readOnly || !!job.voided_at;
  return (
    <>
      <PageHeader
        title={job.contract_number}
        breadcrumbs={[{ label: "Jobs", href: "/jobs" }, { label: job.contract_number }]}
        description={job.description ?? "Description not available"}
        actions={
          <Link href={`/forecast?job=${id}`} className="text-accent underline">
            Job forecast
          </Link>
        }
      />
      <PageBody>
        {job.voided_at && <p role="status">Voided: {job.void_reason}</p>}
        <StatGrid>
          <StatCard
            label="Contract value"
            value={<Money cents={value === null ? null : value} whole />}
          />
          <StatCard
            label="Billed to date"
            value={<Money cents={invoices.reduce((s, i) => s + i.billed_cents, 0)} whole />}
            footnote="Submitted, accepted and paid invoices; drafts/rejected/voided excluded."
          />
          <StatCard
            label="Paid to date"
            value={<Money cents={totals.reduce((s, t) => s + t.paid + t.retainagePaid, 0)} whole />}
          />
          <StatCard
            label="Retainage held"
            value={<Money cents={totals.reduce((s, t) => s + t.retainageHeld, 0)} whole />}
          />
          <StatCard
            label="Net outstanding"
            value={<Money cents={totals.reduce((s, t) => s + t.remaining, 0)} whole />}
          />
          <StatCard
            label="Pending changes"
            value={
              <Money
                cents={changes
                  .filter((c) => c.status === "pending")
                  .reduce((s, c) => s + c.amount_cents, 0)}
                whole
              />
            }
          />
        </StatGrid>
        <Panel title="Job details">
          <p className="mb-4 text-sm text-fg-muted">
            Public obligations: <Money cents={job.obligated_cents} /> · Forecast value before
            approved changes:{" "}
            <Money
              cents={
                assumptions?.value_override_cents ?? job.obligated_cents ?? job.contract_value_cents
              }
            />
          </p>
          <JobForm job={job} readOnly={readOnly} />
          {snapshot && (
            <details className="mt-4">
              <summary className="cursor-pointer">Original USAspending values</summary>
              <a href={snapshot.source_url} className="text-accent underline">
                Source award
              </a>
              <DescriptionList
                items={Object.entries(snapshot.original).map(([label, value]) => ({
                  label,
                  value: value === null ? "Not available" : String(value),
                }))}
              />
              <p className="text-sm text-fg-muted">
                Imported baseline includes changes already reflected by the source. Add only
                adjustments outside that baseline.
              </p>
            </details>
          )}
          <VoidForm kind="job" id={id} readOnly={readOnly} />
        </Panel>
        <Panel title="Change orders">
          <RecordTable
            label="Change orders"
            headers={["Reference", "Amount", "Date", "Status", "Notes"]}
          >
            {changes.map((c) => (
              <tr key={c.id}>
                <td className={cell}>
                  <details>
                    <summary className="cursor-pointer">{c.reference}</summary>
                    <ActionForm action={saveChange} label="Save change" readOnly={readOnly}>
                      <Hidden name="job_id" value={id} />
                      <Hidden name="id" value={c.id} />
                      <Input
                        name="reference"
                        label={`Change reference ${c.reference}`}
                        value={c.reference}
                        required
                      />
                      <Input
                        name="amount_cents"
                        label={`Change amount ${c.reference} ($)`}
                        value={dollars(c.amount_cents)}
                        required
                      />
                      <Input
                        name="date"
                        label={`Change date ${c.reference}`}
                        type="date"
                        value={c.date}
                        required
                      />
                      <Options
                        name="status"
                        label={`Change status ${c.reference}`}
                        value={c.status}
                      >
                        {["pending", "approved", "rejected"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Options>
                      <Notes name="notes" label={`Change notes ${c.reference}`} value={c.notes} />
                    </ActionForm>
                    <VoidForm kind="change" id={c.id} readOnly={readOnly} />
                  </details>
                </td>
                <td className={cell}>{<Money cents={c.amount_cents} />}</td>
                <td className={cell}>{<DateText value={c.date} />}</td>
                <td className={cell}>
                  <Status value={c.status} />
                </td>
                <td className={cell}>{c.notes ?? "Not available"}</td>
              </tr>
            ))}
          </RecordTable>
          <details className="mt-4">
            <summary className="cursor-pointer">Add change order</summary>
            <div className="pt-3">
              <ActionForm action={saveChange} label="Add change" readOnly={readOnly}>
                <Hidden name="job_id" value={id} />
                <Input name="reference" label="Change reference" required />
                <Input
                  name="amount_cents"
                  label="Change amount ($)"
                  required
                  hint="Negative amounts reduce value. Pending amounts are excluded."
                />
                <Input name="date" label="Change date" type="date" value={today()} required />
                <Options name="status" label="Change status" value="pending">
                  {["pending", "approved", "rejected"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Options>
                <Notes name="notes" label="Change notes" />
              </ActionForm>
            </div>
          </details>
        </Panel>
        <Panel title="Government invoices">
          <InvoiceList
            invoices={data.invoices.filter((i) => i.job_id === id)}
            payments={data.payments}
            jobs={data.jobs}
          />
        </Panel>
        <Panel title="Add government invoice">
          <InvoiceForm jobs={[job]} jobId={id} readOnly={readOnly} />
        </Panel>
        <Panel
          id="assumptions"
          title="Future billing assumptions"
          description="Calendar-month billings and weekly job costs for remaining work. Projected, not invoiced; verify these assumptions."
        >
          <ActionForm action={saveAssumptions} label="Save assumptions" readOnly={readOnly}>
            <Hidden name="job_id" value={id} />
            <Checkbox
              name="enabled"
              defaultChecked={assumptions?.enabled ?? true}
              label="Include projected future billings"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                name="cost_ratio_bps"
                label="Cost ratio (%)"
                type="number"
                step="0.01"
                value={(assumptions?.cost_ratio_bps ?? FORECAST_DEFAULTS.costRatioBps) / 100}
                required
              />
              <Hidden name="duration_months" value="1" />
              <Input
                name="billed_before_tracking_cents"
                label="Billed before tracking ($)"
                value={dollars(assumptions?.billed_before_tracking_cents ?? 0)}
                hint="Opening billed total; historical invoices replace this total rather than adding it again."
                required
              />
              <Input
                name="billed_through_date"
                label="Opening billed total as-of date"
                type="date"
                max={today()}
                value={assumptions?.billed_through_date ?? today()}
                required
              />
              <Input
                name="value_override_cents"
                label="Forecast billing value override ($, optional)"
                value={dollars(assumptions?.value_override_cents)}
                hint="Default: public obligations, or entered contract value if obligations are unavailable. Approved changes are added separately."
              />
              <Input
                name="payment_lag_days"
                label="Expected payment lag (days)"
                type="number"
                value={assumptions?.payment_lag_days ?? FORECAST_DEFAULTS.paymentLagDays}
                required
                min={0}
              />
              <Hidden name="retainage_release_days" value="0" />
              <Options
                name="cost_profile"
                label="Cost profile"
                value={assumptions?.cost_profile ?? "even"}
              >
                <option value="even">Even</option>
                <option value="front-loaded">Front-loaded (descending monthly weights)</option>
              </Options>
              <Options
                name="cost_mode"
                label="Forecast cost source"
                value={assumptions?.cost_mode ?? FORECAST_DEFAULTS.costMode}
              >
                <option value="explicit">Entered job costs only</option>
                <option value="modeled">Projected job costs (overhead stays separate)</option>
              </Options>
            </div>
            <p className="text-sm text-fg-muted">
              Real invoices suppress projections for overlapping billing periods. Entered job costs
              replace the entire cost-ratio model for that job; company overhead is added once. A
              billing value and future end date are required. No retainage release is projected
              without an actual invoice and expected release date.
            </p>
          </ActionForm>
        </Panel>
        <Panel title="Job audit history">
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="text-sm">
                {h.created_at.toISOString()} · {h.operation} ·{" "}
                {data.organization.is_demo ? "Demo actor" : (h.actor_id ?? "Administrative script")}
              </li>
            ))}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
