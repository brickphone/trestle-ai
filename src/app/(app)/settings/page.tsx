import { loadData } from "@/lib/data/repository";
import { saveBalance, saveCost } from "@/lib/data/actions";
import { today } from "@/lib/finance";
import { formatUsd, formatDate } from "@/lib/format";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel, DescriptionList } from "@/components/ui/panel";
import { ActionForm } from "@/components/product/action-form";
import { Input, Options } from "@/components/product/fields";
import { RecordTable, cell } from "@/components/product/record-table";
import { VoidForm } from "@/components/product/void-form";
export default async function SettingsPage() {
  const data = await loadData();
  return (
    <>
      <PageHeader title="Settings" description="Opening balances and recurring cost assumptions." />
      <PageBody>
        <Panel title="Organization">
          <DescriptionList
            items={[
              { label: "Company", value: data.organization.name },
              { label: "UEI", value: data.organization.uei ?? "Not available" },
              { label: "Plan", value: data.organization.plan },
              { label: "Entry source", value: data.organization.origin },
            ]}
          />
        </Panel>
        <Panel
          id="balances"
          title="Opening bank balances"
          description="Enter the balance at the start of the as-of date. Company cash is never allocated to jobs automatically."
        >
          <RecordTable label="Opening balances" headers={["As of", "Scope", "Amount", "State"]}>
            {data.balances.map((b) => (
              <tr key={b.id} id={`balance-${b.id}`}>
                <td className={cell}>{formatDate(b.as_of_date)}</td>
                <td className={cell}>
                  {b.job_id
                    ? (data.jobs.find((j) => j.id === b.job_id)?.contract_number ?? "Not available")
                    : "Company"}
                </td>
                <td className={cell}>{formatUsd(b.amount_cents / 100, { cents: true })}</td>
                <td className={cell}>
                  {b.voided_at ? (
                    `Voided: ${b.void_reason}`
                  ) : (
                    <VoidForm kind="balance" id={b.id} readOnly={data.readOnly} />
                  )}
                </td>
              </tr>
            ))}
          </RecordTable>
          <div className="mt-4">
            <ActionForm
              action={saveBalance}
              label="Record opening balance"
              readOnly={data.readOnly}
            >
              <div className="grid gap-3 md:grid-cols-3">
                <Input name="amount_cents" label="Opening balance ($)" required />
                <Input
                  name="as_of_date"
                  label="Opening balance as-of date"
                  type="date"
                  value={today()}
                  max={today()}
                  required
                />
                <Options name="job_id" label="Balance scope">
                  <option value="">Company</option>
                  {data.jobs
                    .filter((j) => !j.voided_at)
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.contract_number}
                      </option>
                    ))}
                </Options>
              </div>
            </ActionForm>
          </div>
        </Panel>
        <Panel
          title="Recurring costs"
          description="Manual estimates. Choose company-wide or a specific job. Void an old estimate and add its replacement to preserve history."
        >
          <RecordTable
            label="Recurring costs"
            headers={["Cost", "Scope", "Amount", "Schedule", "State"]}
          >
            {data.costs.map((c) => (
              <tr key={c.id} id={`cost-${c.id}`}>
                <td className={cell}>{c.label}</td>
                <td className={cell}>
                  {c.job_id
                    ? (data.jobs.find((j) => j.id === c.job_id)?.contract_number ?? "Not available")
                    : "Company"}
                </td>
                <td className={cell}>{formatUsd(c.amount_cents / 100, { cents: true })}</td>
                <td className={cell}>
                  {c.frequency} · {formatDate(c.start_date)} –{" "}
                  {c.end_date ? formatDate(c.end_date) : "Ongoing"}
                </td>
                <td className={cell}>
                  {c.voided_at ? (
                    `Voided: ${c.void_reason}`
                  ) : (
                    <VoidForm kind="cost" id={c.id} readOnly={data.readOnly} />
                  )}
                </td>
              </tr>
            ))}
          </RecordTable>
          <div className="mt-4">
            <ActionForm action={saveCost} label="Add recurring cost" readOnly={data.readOnly}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="label" label="Cost label" required />
                <Options name="category" label="Cost category">
                  <option value="payroll">Payroll estimate</option>
                  <option value="other">Other recurring cost</option>
                </Options>
                <Input name="amount_cents" label="Recurring amount ($)" required />
                <Options name="frequency" label="Frequency">
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </Options>
                <Input
                  name="start_date"
                  label="First cost date"
                  type="date"
                  value={today()}
                  required
                />
                <Input name="end_date" label="Last cost date (optional)" type="date" />
                <Options name="job_id" label="Cost scope">
                  <option value="">Company</option>
                  {data.jobs
                    .filter((j) => !j.voided_at)
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.contract_number}
                      </option>
                    ))}
                </Options>
              </div>
            </ActionForm>
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
