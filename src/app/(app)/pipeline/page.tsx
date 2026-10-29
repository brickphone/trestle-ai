import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Pipeline" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        title="Pipeline"
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Pipeline" }]}
        description="Outreach status, owner, notes and last-touched date for each firm."
      />
      <PageBody>
        <EmptyState
          title="No firms in the pipeline"
          description="Add firms from the Prospects table or a firm detail page to start tracking outreach."
        />
      </PageBody>
    </>
  );
}
