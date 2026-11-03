import { loadData } from "@/lib/data/repository";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { JobForm } from "@/components/product/job-form";
export default async function NewJobPage() {
  const data = await loadData();
  return (
    <>
      <PageHeader
        title="Add job"
        breadcrumbs={[{ label: "Jobs", href: "/jobs" }, { label: "Add job" }]}
      />
      <PageBody>
        <JobForm readOnly={data.readOnly} />
        <div>
          <ButtonLink href="/jobs">Cancel</ButtonLink>
        </div>
      </PageBody>
    </>
  );
}
