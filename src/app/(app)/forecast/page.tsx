import { loadData } from "@/lib/data/repository";
import { forecast } from "@/lib/forecast";
import { notFound } from "next/navigation";
import { isoDate, today } from "@/lib/finance";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { ForecastView } from "@/components/product/forecast-view";
import { Input, Options } from "@/components/product/fields";
import { Button } from "@/components/ui/button";
export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; start?: string }>;
}) {
  const data = await loadData();
  const params = await searchParams;
  const job = data.jobs.find((j) => j.id === params.job && !j.voided_at);
  const balance = data.balances.find((b) => !b.voided_at && (b.job_id ?? undefined) === job?.id);
  if (params.job && !job) notFound();
  const parsedStart = isoDate.safeParse(params.start);
  const start = parsedStart.success ? parsedStart.data : (balance?.as_of_date ?? today());
  const result = forecast(data, start, job?.id);
  return (
    <>
      <PageHeader
        title="13-week forecast"
        description="A traceable weekly projection from your records and explicit assumptions."
      />
      <PageBody>
        <form action="/forecast" className="flex flex-wrap items-end gap-3">
          <Options name="job" label="Forecast scope" value={job?.id ?? ""}>
            <option value="">Company</option>
            {data.jobs
              .filter((j) => !j.voided_at)
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.contract_number}
                </option>
              ))}
          </Options>
          <Input
            name="start"
            label="Forecast start / opening balance date"
            type="date"
            value={start}
            required
          />
          <Button type="submit">Update view</Button>
        </form>
        {balance && balance.as_of_date < today() && (
          <p className="border border-warning bg-warning-subtle p-3 text-warning-strong">
            This forecast is anchored to an older opening balance.{" "}
            <a href="/settings#balances" className="underline">
              Record a current balance
            </a>{" "}
            to project the coming 13 weeks.
          </p>
        )}
        <ForecastView result={result} />
      </PageBody>
    </>
  );
}
