import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Firms ingested, target-band coverage, average score and data freshness for each segment."
      />
      <PageBody>
        <EmptyState
          title="No segments ingested yet"
          description="Segment summaries appear here after the first USAspending ingestion run."
        />
      </PageBody>
    </>
  );
}
