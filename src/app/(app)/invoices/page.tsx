import { loadData } from "@/lib/data/repository";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { InvoiceList } from "@/components/product/invoice-list";
import { InvoiceForm } from "@/components/product/invoice-form";
export default async function InvoicesPage() {
  const data = await loadData();
  return (
    <>
      <PageHeader
        title="Government invoices"
        description="Track pay applications, partial payments and retainage receipts."
      />
      <PageBody>
        <InvoiceList invoices={data.invoices} payments={data.payments} jobs={data.jobs} />
        {data.jobs.some((j) => !j.voided_at) ? (
          <Panel title="Add government invoice">
            <InvoiceForm jobs={data.jobs} readOnly={data.readOnly} />
          </Panel>
        ) : (
          <p>Add a job before creating invoices.</p>
        )}
      </PageBody>
    </>
  );
}
