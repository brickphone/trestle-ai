import Link from "next/link";
import { jobDisplayName } from "@/lib/job-display";
import { loadData } from "@/lib/data/repository";
import { effectiveValue } from "@/lib/forecast";
import { Money, DateText } from "@/components/ui/financial";
import { Status } from "@/components/ui/badge";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { RecordTable, cell, link } from "@/components/product/record-table";
export default async function JobsPage() {
  const data = await loadData();
  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          !data.readOnly ? (
            <ButtonLink href="/jobs/new" variant="primary">
              Add job
            </ButtonLink>
          ) : undefined
        }
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
                      {jobDisplayName(j)}
                    </Link>
                    <span className="block text-xs text-fg-subtle">{j.contract_number}</span>
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
                No jobs yet. Use Add job to create your first job.
              </td>
            </tr>
          )}
        </RecordTable>
      </PageBody>
    </>
  );
}
