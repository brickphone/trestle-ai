import { redirect } from "next/navigation";
import { loadData } from "@/lib/data/repository";
import { companySetupSeed, refreshMissingObligations } from "@/lib/onboarding/editing";
import { lookupUei } from "@/lib/usaspending";
import { today } from "@/lib/finance";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { ContractEditor } from "@/components/product/contract-editor";
export default async function EditContractsPage() {
  const data = await loadData();
  if (data.readOnly || !data.isOwner) redirect("/settings");
  const asOf = today(),
    seed = companySetupSeed(await refreshMissingObligations(data, asOf, lookupUei), asOf);
  return (
    <>
      <PageHeader title="Edit contracts" description="Review tracked work and billing details." />
      <PageBody>
        <ContractEditor
          result={seed.result}
          asOf={asOf}
          selected={seed.initial.selected}
          inputs={seed.initial.awardInputs ?? {}}
          organizationId={data.organization.id}
        />
      </PageBody>
    </>
  );
}
