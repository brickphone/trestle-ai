import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/states";
import { PageBody, PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Cash-gap calculator" };

export default function CalculatorPage() {
  return (
    <>
      <PageHeader
        title="Cash-gap calculator"
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Cash-gap calculator" }]}
        description="Enter a contract value, duration and assumptions to estimate the cash curve and peak financing need."
      />
      <PageBody>
        <EmptyState
          title="Calculator not available yet"
          description="The cash-gap model is built in a later step."
        />
      </PageBody>
    </>
  );
}
