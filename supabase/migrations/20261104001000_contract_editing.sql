-- Tracking controls projections only. Financial history and immutable source snapshots remain intact.
alter table public.jobs add column is_tracked boolean not null default true;
alter table public.forecast_assumptions add column billed_source text not null default 'legacy' check(billed_source in ('legacy','schedule','manual'));
-- Recover obligations imported before the dedicated column was populated. Never use an IDV ceiling.
update public.jobs j set obligated_cents=(s.original->>'obligationsCents')::numeric::bigint
from public.source_snapshots s where j.obligated_cents is null and j.source_snapshot_id=s.id and j.organization_id=s.organization_id
and jsonb_typeof(s.original->'obligationsCents')='number'
and (s.original->>'obligationsCents')::numeric between 0 and 1000000000000
and (s.original->>'obligationsCents')::numeric=trunc((s.original->>'obligationsCents')::numeric);

create function public.update_contracts(org_id uuid,contract_values jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
declare entry jsonb; target public.jobs; supplied bigint; source text;
begin
 if not app.is_owner(org_id) or not app.can_write_org(org_id) then raise exception 'Only an owner can edit contracts' using errcode='42501'; end if;
 if jsonb_typeof(contract_values) is distinct from 'array' or jsonb_array_length(contract_values)>1000 then raise exception 'Invalid contracts'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(contract_values))<>jsonb_array_length(contract_values) then raise exception 'Duplicate contracts'; end if;
 for entry in select value from jsonb_array_elements(contract_values) loop
  select * into target from public.jobs where id=(entry->>'id')::uuid and organization_id=org_id and voided_at is null for no key update;
  if not found then raise exception 'Job not available'; end if;
  if jsonb_typeof(entry->'tracked') is distinct from 'boolean' then raise exception 'Tracking state required'; end if;
  update public.jobs set is_tracked=(entry->>'tracked')::boolean where id=target.id and organization_id=org_id;
  if not (entry->>'tracked')::boolean then continue; end if;
  if (entry->>'publicObligationsCents') is not null then
   update public.jobs set obligated_cents=(entry->>'publicObligationsCents')::bigint where id=target.id and organization_id=org_id;
   target.obligated_cents:=(entry->>'publicObligationsCents')::bigint;
  end if;
  supplied:=(entry->>'contractValueCents')::bigint;
  if supplied is not null and (supplied<=0 or supplied>1000000000000) then raise exception 'Invalid contract value'; end if;
  if supplied is not null then update public.jobs set contract_value_cents=supplied where id=target.id and organization_id=org_id; end if;
  if coalesce(supplied,target.obligated_cents,target.contract_value_cents,(select value_override_cents from public.forecast_assumptions where organization_id=org_id and job_id=target.id)) is null then raise exception 'Enter the missing contract value'; end if;
  if (entry->>'billedCents') is null or (entry->>'paymentLagDays') is null then raise exception 'Billing details required'; end if;
  source:=entry->>'billedSource';
  if source is null or source not in ('schedule','manual') then raise exception 'Billing source required'; end if;
  insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,billed_before_tracking_cents,billed_through_date,billed_source)
  values(org_id,target.id,true,8500,'even',1,(entry->>'paymentLagDays')::integer,0,'modeled',(entry->>'billedCents')::bigint,current_date,source)
  on conflict(organization_id,job_id) do update set payment_lag_days=excluded.payment_lag_days,billed_before_tracking_cents=excluded.billed_before_tracking_cents,billed_source=excluded.billed_source,
  billed_through_date=case when public.forecast_assumptions.billed_before_tracking_cents is distinct from excluded.billed_before_tracking_cents then current_date else coalesce(public.forecast_assumptions.billed_through_date,current_date) end;
 end loop;
 return true;
end; $$;
revoke all on function public.update_contracts(uuid,jsonb) from public,anon;
grant execute on function public.update_contracts(uuid,jsonb) to authenticated;

create or replace function public.complete_onboarding(company_name text,company_uei text,company_origin text,awards jsonb,opening_balance bigint,balance_date date,payroll bigint,retainage_bps integer,payment_terms_days integer,other_monthly_costs bigint default null,job_inputs jsonb default '[]'::jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid; award jsonb; snapshot uuid; tracked_job uuid; settings jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(awards)<>'array' or jsonb_array_length(awards)>1000 then raise exception 'Invalid award selection'; end if;
 if jsonb_typeof(job_inputs)<>'array' or jsonb_array_length(job_inputs)>1000 then raise exception 'Invalid job inputs'; end if;
 if balance_date>current_date or payroll<0 or other_monthly_costs<0 then raise exception 'Invalid starting assumptions'; end if;
 org:=app.create_organization(company_name,company_uei,company_origin);
 for award in select value from jsonb_array_elements(awards) loop
  select value into settings from jsonb_array_elements(job_inputs) where value->>'externalId'=award->>'externalId' limit 1;
  if coalesce((award->>'obligationsCents')::bigint,(award->>'contractValueCents')::bigint,(settings->>'contractValueCents')::bigint) is null then raise exception 'Enter the missing contract value'; end if;
  insert into public.source_snapshots(organization_id,external_id,source_url,original)
  values(org,award->>'externalId',award->>'sourceUrl',award) returning id into snapshot;
  insert into public.jobs(organization_id,source_snapshot_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status,obligated_cents)
  values(org,snapshot,award->>'contractNumber',award->>'agency',
    case when award ? 'displayDescription' then award->>'displayDescription' else award->>'description' end,
    coalesce((settings->>'contractValueCents')::bigint,(award->>'contractValueCents')::bigint),(award->>'startDate')::date,(award->>'endDate')::date,retainage_bps,payment_terms_days,
    case when (award->>'endDate') is null then 'planned' when (award->>'endDate')::date<current_date then 'complete' else 'active' end,
    case when jsonb_typeof(award->'obligationsCents')='number' and (award->>'obligationsCents')::numeric between 0 and 1000000000000 then (award->>'obligationsCents')::bigint else null end) returning id into tracked_job;
  select value into settings from jsonb_array_elements(job_inputs) where value->>'externalId'=award->>'externalId' limit 1;
  insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,billed_before_tracking_cents,billed_through_date,billed_source,value_override_cents) values(org,tracked_job,true,coalesce((settings->>'costRatioBps')::integer,8500),'even',1,coalesce((settings->>'paymentLagDays')::integer,30),0,'modeled',coalesce((settings->>'billedCents')::bigint,0),current_date,coalesce(settings->>'billedSource','manual'),(settings->>'contractValueCents')::bigint);
 end loop;
 if opening_balance is not null then insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date) values(org,opening_balance,balance_date); end if;
 if payroll>0 then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date,cost_scope) values(org,'Weekly office payroll','payroll',payroll,'weekly',balance_date,'overhead'); end if;
 if other_monthly_costs>0 then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date,cost_scope) values(org,'Monthly overhead','other',other_monthly_costs,'monthly',balance_date,'overhead'); end if;
 delete from public.onboarding_drafts where user_id=auth.uid();
 update public.organizations set onboarding_complete=true where id=org;
 return org;
end; $$;
revoke all on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer,bigint,jsonb) from public,anon;
grant execute on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer,bigint,jsonb) to authenticated;

notify pgrst,'reload schema';
