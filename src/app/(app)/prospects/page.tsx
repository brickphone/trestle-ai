import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Prospects" };

export default function ProspectsPage() {
  return (
    <>
      <PageHeader
        title="Prospects"
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Prospects" }]}
        description="Ranked firms across segments. Filter, sort, choose columns and export to CSV."
      />
      <PageBody>
        <EmptyState
          title="No firms yet"
          description="Prospects appear here after the first ingestion run and SAM.gov enrichment."
        />
      </PageBody>
    </>
  );
}
