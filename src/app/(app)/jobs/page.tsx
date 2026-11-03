import Link from "next/link";
import { loadData } from "@/lib/data/repository";
import { effectiveValue } from "@/lib/forecast";
import { Money, DateText } from "@/components/ui/financial";
import { Status } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { JobForm } from "@/components/product/job-form";
import { RecordTable, cell, link } from "@/components/product/record-table";
export default async function JobsPage() {
  const data = await loadData();
  return (
    <>
      <PageHeader
        title="Jobs"
        description="Federal contracts and approved changes. Pending changes stay separate."
      />
      <PageBody>
        <RecordTable
          label="Jobs"
          headers={["Contract", "Agency", "Status", "Contract value", "Dates", "Source"]}
        >
          {data.jobs
            .filter((j) => !j.voided_at)
            .map((j) => {
              const value = effectiveValue(j, data.changes);
              return (
                <tr key={j.id}>
                  <td className={cell}>
                    <Link className={link} href={`/jobs/${j.id}`}>
                      {j.contract_number}
                    </Link>
                  </td>
                  <td className={cell}>{j.agency ?? "Not available"}</td>
                  <td className={cell}>
                    <Status value={j.status} />
                  </td>
                  <td className={cell}>
                    <Money cents={value} />
                  </td>
                  <td className={cell}>
                    <DateText value={j.start_date} /> – <DateText value={j.end_date} />
                  </td>
                  <td className={cell}>
                    {j.source_snapshot_id ? "USAspending + your edits" : "Manual entry"}
                  </td>
                </tr>
              );
            })}
          {!data.jobs.some((j) => !j.voided_at) && (
            <tr>
              <td className={cell} colSpan={6}>
                No jobs yet. Add your first job below.
              </td>
            </tr>
          )}
        </RecordTable>
        <Panel title="Add a job">
          <JobForm readOnly={data.readOnly} />
        </Panel>
      </PageBody>
    </>
  );
}
