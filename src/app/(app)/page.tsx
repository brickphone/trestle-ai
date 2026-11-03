import { loadData } from "@/lib/data/repository";
import { OverviewContent } from "@/components/product/overview-content";

export default async function OverviewPage() {
  return <OverviewContent data={await loadData()} />;
}
