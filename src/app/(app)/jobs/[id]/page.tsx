import Link from "next/link";
import { notFound } from "next/navigation";
import { loadData, recordHistory } from "@/lib/data/repository";
import { effectiveValue, invoiceTotals } from "@/lib/forecast";
import { saveChange, saveAssumptions } from "@/lib/data/actions";
import { formatUsd, formatDate } from "@/lib/format";
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
            value={formatUsd(value === null ? null : value / 100, { cents: true })}
          />
          <StatCard
            label="Billed to date"
            value={formatUsd(invoices.reduce((s, i) => s + i.billed_cents, 0) / 100, {
              cents: true,
            })}
            footnote="Submitted, accepted and paid invoices; drafts/rejected/voided excluded."
          />
          <StatCard
            label="Paid to date"
            value={formatUsd(totals.reduce((s, t) => s + t.paid + t.retainagePaid, 0) / 100, {
              cents: true,
            })}
          />
          <StatCard
            label="Retainage held"
            value={formatUsd(totals.reduce((s, t) => s + t.retainageHeld, 0) / 100, {
              cents: true,
            })}
          />
          <StatCard
            label="Net outstanding"
            value={formatUsd(totals.reduce((s, t) => s + t.remaining, 0) / 100, { cents: true })}
          />
          <StatCard
            label="Pending changes"
            value={formatUsd(
              changes
                .filter((c) => c.status === "pending")
                .reduce((s, c) => s + c.amount_cents, 0) / 100,
              { cents: true },
            )}
          />
        </StatGrid>
        <Panel title="Job details">
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
                <td className={cell}>{formatUsd(c.amount_cents / 100, { cents: true })}</td>
                <td className={cell}>{formatDate(c.date)}</td>
                <td className={cell}>{c.status}</td>
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
          description="Optional scenario. 30-day model months; costs at month end. These are estimates, not observed job data."
        >
          <ActionForm action={saveAssumptions} label="Save assumptions" readOnly={readOnly}>
            <Hidden name="job_id" value={id} />
            <Checkbox
              name="enabled"
              defaultChecked={assumptions?.enabled ?? false}
              label="Include projected future billings"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                name="cost_ratio_bps"
                label="Cost ratio (%)"
                type="number"
                step="0.01"
                value={assumptions ? assumptions.cost_ratio_bps / 100 : ""}
                required
              />
              <Input
                name="duration_months"
                label="Duration (30-day months)"
                type="number"
                value={assumptions?.duration_months}
                required
                min={1}
              />
              <Input
                name="payment_lag_days"
                label="Expected payment lag (days)"
                type="number"
                value={assumptions?.payment_lag_days}
                required
                min={0}
              />
              <Input
                name="retainage_release_days"
                label="Retainage receipt delay after completion (days)"
                type="number"
                value={assumptions?.retainage_release_days}
                required
                min={0}
              />
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
                value={assumptions?.cost_mode ?? "explicit"}
              >
                <option value="explicit">Entered recurring costs only</option>
                <option value="modeled">Model costs (no entered recurring costs)</option>
              </Options>
            </div>
            <p className="text-sm text-fg-muted">
              Existing invoices replace modeled billings. Modeled costs cannot overlap entered
              recurring costs. The model requires the job value and start date.
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
