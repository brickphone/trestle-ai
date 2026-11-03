-- Keep public obligations separate from contract ceilings and user-entered overrides.
alter table public.jobs add column obligated_cents bigint check(obligated_cents between 0 and 1000000000000);
update public.jobs j set obligated_cents=(s.original->>'obligationsCents')::bigint
from public.source_snapshots s where j.source_snapshot_id=s.id and j.organization_id=s.organization_id
and jsonb_typeof(s.original->'obligationsCents')='number'
and (s.original->>'obligationsCents')::numeric between 0 and 1000000000000;
alter table public.forecast_assumptions add column billed_before_tracking_cents bigint not null default 0 check(billed_before_tracking_cents between 0 and 1000000000000);
alter table public.forecast_assumptions add column billed_through_date date;
alter table public.forecast_assumptions add column value_override_cents bigint check(value_override_cents between 0 and 1000000000000);
alter table public.recurring_costs add column cost_scope text not null default 'unclassified' check(cost_scope in ('job','overhead','unclassified'));
update public.recurring_costs set cost_scope=case when job_id is not null then 'job' when label in ('Other monthly costs','Demo overhead','Rent & operating costs') then 'overhead' else 'unclassified' end;
-- Older callers that identify a job already unambiguously identify a job cost.
create function app.infer_cost_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if new.cost_scope='unclassified' then
  if new.job_id is not null then new.cost_scope:='job';
  elsif new.label in ('Other monthly costs','Demo overhead','Rent & operating costs') then new.cost_scope:='overhead'; end if;
 end if;
 return new;
end; $$;
revoke all on function app.infer_cost_scope() from public,anon,authenticated;
create trigger infer_cost_scope before insert or update on public.recurring_costs for each row execute function app.infer_cost_scope();
alter table public.recurring_costs add constraint cost_scope_job_link check((cost_scope='job' and job_id is not null) or (cost_scope in ('overhead','unclassified') and job_id is null));
-- Existing unallocated payroll is deliberately not guessed to be office overhead.

drop function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer,bigint);
create function public.complete_onboarding(company_name text,company_uei text,company_origin text,awards jsonb,opening_balance bigint,balance_date date,payroll bigint,retainage_bps integer,payment_terms_days integer,other_monthly_costs bigint default null,job_inputs jsonb default '[]'::jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid; award jsonb; snapshot uuid; tracked_job uuid; settings jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(awards)<>'array' or jsonb_array_length(awards)>1000 then raise exception 'Invalid award selection'; end if;
 if jsonb_typeof(job_inputs)<>'array' or jsonb_array_length(job_inputs)>1000 then raise exception 'Invalid job inputs'; end if;
 if balance_date>current_date or payroll<0 or other_monthly_costs<0 then raise exception 'Invalid starting assumptions'; end if;
 org:=app.create_organization(company_name,company_uei,company_origin);
 for award in select value from jsonb_array_elements(awards) loop
  insert into public.source_snapshots(organization_id,external_id,source_url,original)
  values(org,award->>'externalId',award->>'sourceUrl',award) returning id into snapshot;
  insert into public.jobs(organization_id,source_snapshot_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status,obligated_cents)
  values(org,snapshot,award->>'contractNumber',award->>'agency',
    case when award ? 'displayDescription' then award->>'displayDescription' else award->>'description' end,
    (award->>'contractValueCents')::bigint,(award->>'startDate')::date,(award->>'endDate')::date,retainage_bps,payment_terms_days,
    case when (award->>'endDate') is null then 'planned' when (award->>'endDate')::date<current_date then 'complete' else 'active' end,
    case when jsonb_typeof(award->'obligationsCents')='number' and (award->>'obligationsCents')::numeric between 0 and 1000000000000 then (award->>'obligationsCents')::bigint else null end) returning id into tracked_job;
  select value into settings from jsonb_array_elements(job_inputs) where value->>'externalId'=award->>'externalId' limit 1;
  insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,billed_before_tracking_cents,billed_through_date) values(org,tracked_job,true,coalesce((settings->>'costRatioBps')::integer,8500),'even',1,coalesce((settings->>'paymentLagDays')::integer,30),0,'modeled',coalesce((settings->>'billedCents')::bigint,0),current_date);
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

-- A user edit to the job's contract value is an explicit forecast override, atomically.
create function app.sync_forecast_value_override() returns trigger language plpgsql set search_path='' as $$
begin
 if new.contract_value_cents is distinct from old.contract_value_cents then
  insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,value_override_cents)
  values(new.organization_id,new.id,true,8500,'even',1,30,0,'modeled',new.contract_value_cents)
  on conflict(organization_id,job_id) do update set value_override_cents=excluded.value_override_cents;
 end if;
 return new;
end; $$;
revoke all on function app.sync_forecast_value_override() from public,anon,authenticated;
create trigger sync_forecast_value_override after update of contract_value_cents on public.jobs for each row execute function app.sync_forecast_value_override();
