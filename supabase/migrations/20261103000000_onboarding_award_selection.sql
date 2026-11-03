-- Remove the old one-page selection limit. Preserve raw source text independently
-- from cleaned job descriptions, and do not import completed awards as active jobs.
create or replace function public.complete_onboarding(company_name text,company_uei text,company_origin text,awards jsonb,opening_balance bigint,balance_date date,payroll bigint,retainage_bps integer,payment_terms_days integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid; award jsonb; snapshot uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(awards)<>'array' or jsonb_array_length(awards)>1000 then raise exception 'Invalid award selection'; end if;
 if balance_date>current_date or payroll<=0 then raise exception 'Invalid starting assumptions'; end if;
 org:=app.create_organization(company_name,company_uei,company_origin);
 for award in select value from jsonb_array_elements(awards) loop
  insert into public.source_snapshots(organization_id,external_id,source_url,original)
  values(org,award->>'externalId',award->>'sourceUrl',award) returning id into snapshot;
  insert into public.jobs(organization_id,source_snapshot_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status)
  values(org,snapshot,award->>'contractNumber',award->>'agency',
    case when award ? 'displayDescription' then award->>'displayDescription' else award->>'description' end,
    (award->>'contractValueCents')::bigint,(award->>'startDate')::date,(award->>'endDate')::date,retainage_bps,payment_terms_days,
    case when (award->>'endDate') is null then 'planned' when (award->>'endDate')::date<current_date then 'complete' else 'active' end);
 end loop;
 if opening_balance is not null then insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date) values(org,opening_balance,balance_date); end if;
 if payroll is not null then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date) values(org,'Weekly payroll estimate','payroll',payroll,'weekly',balance_date); end if;
 update public.organizations set onboarding_complete=true where id=org;
 return org;
end; $$;
revoke all on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer) from public,anon;
grant execute on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer) to authenticated;
