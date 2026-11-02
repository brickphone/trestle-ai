import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Track federal jobs, government invoices, subcontractor payables and cash flow."
      />
      <PageBody>
        <EmptyState
          title="No jobs added yet"
          description="Job tracking and the 13-week cash forecast are coming in the MVP."
        />
      </PageBody>
    </>
  );
}
