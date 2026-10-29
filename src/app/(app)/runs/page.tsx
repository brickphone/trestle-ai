import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Data runs" };

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Data runs"
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Data runs" }]}
        description="Ingestion and enrichment history: start and end times, records fetched and errors."
      />
      <PageBody>
        <EmptyState
          title="No runs recorded"
          description="Runs are logged here when ingestion scripts execute."
        />
      </PageBody>
    </>
  );
}
