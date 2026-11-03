-- Personal pre-organization progress. Identity comes exclusively from the verified JWT.
create table public.onboarding_drafts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 draft jsonb not null check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=300000)
);
alter table public.onboarding_drafts enable row level security;
alter table public.onboarding_drafts force row level security;
create policy draft_read on public.onboarding_drafts for select to authenticated using(user_id=auth.uid());
create policy draft_write on public.onboarding_drafts for all to authenticated using(user_id=auth.uid() and not app.is_staff() and not exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() and o.is_demo)) with check(user_id=auth.uid() and not app.is_staff() and not exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() and o.is_demo));
revoke all on public.onboarding_drafts from public,anon;
grant select,insert,update,delete on public.onboarding_drafts to authenticated;

create or replace function public.request_security_context() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('role',current_user,'user_id',auth.uid(),'rls_active',
   coalesce((select count(*)=13 and bool_and(row_security_active(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in ('organizations','memberships','staff_users','source_snapshots','jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions','audit_events','onboarding_drafts')),false));
$$;

drop function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer);
create function public.complete_onboarding(company_name text,company_uei text,company_origin text,awards jsonb,opening_balance bigint,balance_date date,payroll bigint,retainage_bps integer,payment_terms_days integer,other_monthly_costs bigint default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid; award jsonb; snapshot uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(awards)<>'array' or jsonb_array_length(awards)>1000 then raise exception 'Invalid award selection'; end if;
 if balance_date>current_date or payroll<=0 or other_monthly_costs<=0 then raise exception 'Invalid starting assumptions'; end if;
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
 if other_monthly_costs is not null then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date) values(org,'Other monthly costs','other',other_monthly_costs,'monthly',balance_date); end if;
 delete from public.onboarding_drafts where user_id=auth.uid();
 update public.organizations set onboarding_complete=true where id=org;
 return org;
end; $$;
revoke all on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer,bigint) from public,anon;
grant execute on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer,bigint) to authenticated;
