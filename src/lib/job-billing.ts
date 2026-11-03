import type { Job, Invoice, Assumption, ChangeOrder, SourceSnapshot } from "./data/types";
import {jobObligations} from "./job-values";
import {scheduleBilledEstimate} from "./onboarding/model";
import { daysBetween } from "./finance";
/** Historical billed baseline already includes imported invoices through its as-of date. */
export function jobBilledToDate(assumption: Assumption | undefined, invoices: Invoice[]) {
  const rows = invoices.filter((i) => !i.voided_at && !["draft", "rejected"].includes(i.status));
  const baseline = assumption?.billed_before_tracking_cents ?? 0,
    date = assumption?.billed_through_date;
  const prior = rows
    .filter((i) => date && (i.submitted_date ?? i.period_end) <= date)
    .reduce((s, i) => s + i.billed_cents, 0);
  const after = rows
    .filter((i) => !date || (i.submitted_date ?? i.period_end) > date)
    .reduce((s, i) => s + i.billed_cents, 0);
  return Math.max(baseline, prior) + after;
}
export function billedScheduleWarning(
  job: Job,
  assumption: Assumption | undefined,
  invoices: Invoice[],
  asOf: string,
) {
  if (
    job.voided_at ||
    job.is_tracked === false ||
    job.status !== "active" ||
    !job.start_date ||
    !job.end_date ||
    job.end_date <= job.start_date ||
    asOf <= job.start_date ||
    asOf > job.end_date ||
    jobBilledToDate(assumption, invoices) > 0
  )
    return null;
  const progress = Math.round(
    Math.min(1, daysBetween(job.start_date, asOf) / daysBetween(job.start_date, job.end_date)) *
      100,
  );
  return progress >= 10
    ? `Billed so far is $0 but this job is ${progress}% through its schedule, so the forecast may be overstated.`
    : null;
}

/** A suggestion only: callers must never persist this while rendering a page. */
export function billedEstimateSuggestion(job:Job,assumption:Assumption|undefined,invoices:Invoice[],changes:ChangeOrder[],snapshots:SourceSnapshot[],asOf:string) {
 if(job.voided_at||job.is_tracked===false||job.status!=="active"||!job.start_date||job.start_date>=asOf||!job.end_date||job.end_date<asOf||jobBilledToDate(assumption,invoices)>0)return null;
 const value=assumption?.value_override_cents??jobObligations(job,snapshots.find(s=>s.id===job.source_snapshot_id))??job.contract_value_cents;
 if(value===null)return null;
 const approved=changes.filter(c=>c.job_id===job.id&&!c.voided_at&&c.status==="approved").reduce((sum,c)=>sum+c.amount_cents,0);
 const estimate=scheduleBilledEstimate(value+approved,job.start_date,job.end_date,asOf);
 return estimate!==null&&estimate>0&&estimate<=1e12?estimate:null;
}
