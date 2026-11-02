-- Use Supabase's standard public Data API schema and authenticated JWT role.
-- Existing tables/rows/FKs/RLS/audits are moved, never copied or dropped.
do $move$ declare t text; p record; definition text;
 tables text[]:=array['organizations','memberships','staff_users','source_snapshots','jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions','audit_events'];
begin
 foreach t in array tables loop
  execute format('alter table app.%I set schema public',t);
 end loop;
 -- Function bodies are text, unlike FKs/policy dependencies. Refresh their table references.
 for p in select oid from pg_proc where pronamespace='app'::regnamespace loop
  definition:=pg_get_functiondef(p.oid);
  foreach t in array tables loop definition:=replace(definition,'app.'||t,'public.'||t); end loop;
  execute definition;
 end loop;
 foreach t in array tables loop
  execute format('revoke all on table public.%I from public,anon,authenticated,service_role',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('alter policy %I on public.%I to authenticated',p.policyname,t);
  end loop;
  execute format('grant select on public.%I to authenticated,service_role',t);
  if t in ('source_snapshots','jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions') then
   execute format('grant insert on public.%I to authenticated',t);
  end if;
  if t in ('jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions') then
   execute format('grant update on public.%I to authenticated',t);
  end if;
 end loop;
end $move$;
grant usage on schema public,app to authenticated;
grant usage on schema public to service_role;
grant update(name,uei,onboarding_complete) on public.organizations to authenticated;
grant execute on function app.is_staff(),app.is_member(uuid),app.can_read_org(uuid),app.can_write_org(uuid),app.is_owner(uuid),app.create_organization(text,text,text) to authenticated;
-- Retire the old application login. Ordinary requests use only the user's JWT.
alter role app_runtime nologin;
revoke app_request from app_runtime;

create function public.request_security_context() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('role',current_user,'user_id',auth.uid(),'rls_active',
   coalesce((select count(*)=12 and bool_and(row_security_active(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in ('organizations','memberships','staff_users','source_snapshots','jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions','audit_events')),false));
$$;
revoke all on function public.request_security_context() from public,anon;
grant execute on function public.request_security_context() to authenticated,service_role;

create function public.complete_onboarding(company_name text,company_uei text,company_origin text,awards jsonb,opening_balance bigint,balance_date date,payroll bigint,retainage_bps integer,payment_terms_days integer) returns uuid
language plpgsql security invoker set search_path='' as $$
declare org uuid; award jsonb; snapshot uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(awards)<>'array' or jsonb_array_length(awards)>20 then raise exception 'Invalid award selection'; end if;
 if balance_date>current_date or payroll<=0 then raise exception 'Invalid starting assumptions'; end if;
 org:=app.create_organization(company_name,company_uei,company_origin);
 for award in select value from jsonb_array_elements(awards) loop
  insert into public.source_snapshots(organization_id,external_id,source_url,original)
  values(org,award->>'externalId',award->>'sourceUrl',award) returning id into snapshot;
  insert into public.jobs(organization_id,source_snapshot_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status)
  values(org,snapshot,award->>'contractNumber',award->>'agency',award->>'description',(award->>'contractValueCents')::bigint,(award->>'startDate')::date,(award->>'endDate')::date,retainage_bps,payment_terms_days,'active');
 end loop;
 if opening_balance is not null then insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date) values(org,opening_balance,balance_date); end if;
 if payroll is not null then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date) values(org,'Weekly payroll estimate','payroll',payroll,'weekly',balance_date); end if;
 update public.organizations set onboarding_complete=true where id=org;
 return org;
end; $$;
revoke all on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer) from public,anon;
grant execute on function public.complete_onboarding(text,text,text,jsonb,bigint,date,bigint,integer,integer) to authenticated;

create function public.save_government_invoice(org_id uuid,invoice_id uuid,invoice_values jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare job public.jobs; original public.government_invoices; saved uuid; held bigint;
begin
 if not app.can_write_org(org_id) then raise exception 'Read-only account' using errcode='42501'; end if;
 select * into job from public.jobs where id=(invoice_values->>'job_id')::uuid and organization_id=org_id and voided_at is null for update;
 if not found then raise exception 'Job not available'; end if;
 held:=coalesce((invoice_values->>'retainage_cents')::bigint,round((invoice_values->>'billed_cents')::numeric*job.retainage_bps/10000)::bigint);
 if invoice_id is null then
  insert into public.government_invoices(organization_id,job_id,invoice_number,period_start,period_end,billed_cents,retainage_cents,submitted_date,proper_receipt_date,expected_payment_date,expected_retainage_date,payment_terms_days,portal,status,rejection_reason,resubmission_of_id)
  values(org_id,job.id,invoice_values->>'invoice_number',(invoice_values->>'period_start')::date,(invoice_values->>'period_end')::date,(invoice_values->>'billed_cents')::bigint,held,(invoice_values->>'submitted_date')::date,(invoice_values->>'proper_receipt_date')::date,(invoice_values->>'expected_payment_date')::date,(invoice_values->>'expected_retainage_date')::date,job.payment_terms_days,invoice_values->>'portal',invoice_values->>'status',invoice_values->>'rejection_reason',(invoice_values->>'resubmission_of_id')::uuid) returning id into saved;
 else
  select * into original from public.government_invoices where id=invoice_id and organization_id=org_id and voided_at is null for update;
  if not found or original.job_id<>job.id then raise exception 'Invoice not available'; end if;
  update public.government_invoices set invoice_number=invoice_values->>'invoice_number',period_start=(invoice_values->>'period_start')::date,period_end=(invoice_values->>'period_end')::date,billed_cents=(invoice_values->>'billed_cents')::bigint,retainage_cents=held,
   submitted_date=(invoice_values->>'submitted_date')::date,proper_receipt_date=(invoice_values->>'proper_receipt_date')::date,expected_payment_date=(invoice_values->>'expected_payment_date')::date,expected_retainage_date=(invoice_values->>'expected_retainage_date')::date,
   portal=invoice_values->>'portal',status=invoice_values->>'status',rejection_reason=invoice_values->>'rejection_reason'
   where id=invoice_id and organization_id=org_id returning id into saved;
 end if;
 return saved;
end; $$;
revoke all on function public.save_government_invoice(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_government_invoice(uuid,uuid,jsonb) to authenticated;

create function public.record_government_payment(org_id uuid,payment_values jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare invoice public.government_invoices; saved uuid; paid bigint;
begin
 if not app.can_write_org(org_id) then raise exception 'Read-only account' using errcode='42501'; end if;
 select * into invoice from public.government_invoices where id=(payment_values->>'invoice_id')::uuid and organization_id=org_id and voided_at is null for update;
 if not found then raise exception 'Invoice not available'; end if;
 if (payment_values->>'received_date')::date>current_date then raise exception 'Payment date cannot be in the future'; end if;
 insert into public.government_payments(organization_id,invoice_id,received_date,amount_cents,kind,reference)
 values(org_id,invoice.id,(payment_values->>'received_date')::date,(payment_values->>'amount_cents')::bigint,payment_values->>'kind',payment_values->>'reference') returning id into saved;
 select coalesce(sum(amount_cents),0) into paid from public.government_payments where invoice_id=invoice.id and kind='progress' and voided_at is null;
 if paid=invoice.billed_cents-invoice.retainage_cents then update public.government_invoices set status='paid' where id=invoice.id and organization_id=org_id; end if;
 return saved;
end; $$;
revoke all on function public.record_government_payment(uuid,jsonb) from public,anon;
grant execute on function public.record_government_payment(uuid,jsonb) to authenticated;

create function public.void_financial_record(org_id uuid,record_kind text,record_id uuid,reason text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare target text; payment public.government_payments; affected bigint;
begin
 if not app.can_write_org(org_id) then raise exception 'Read-only account' using errcode='42501'; end if;
 if reason is null or length(trim(reason))=0 then raise exception 'Void reason is required'; end if;
 target:=case record_kind when 'job' then 'jobs' when 'change' then 'change_orders' when 'invoice' then 'government_invoices' when 'payment' then 'government_payments' when 'balance' then 'cash_balance_entries' when 'cost' then 'recurring_costs' end;
 if target is null then raise exception 'Invalid record type'; end if;
 if record_kind='payment' then
  select * into payment from public.government_payments where id=record_id and organization_id=org_id;
  if found and payment.kind='progress' and payment.voided_at is null then
   perform 1 from public.government_invoices where id=payment.invoice_id and organization_id=org_id for update;
   update public.government_invoices set status='accepted' where id=payment.invoice_id and organization_id=org_id and status='paid';
  end if;
 end if;
 if record_kind='job' then
  perform 1 from public.jobs where id=record_id and organization_id=org_id for update;
  if exists(select 1 from public.government_invoices where job_id=record_id and organization_id=org_id and voided_at is null) then raise exception 'Void the job invoices first'; end if;
 end if;
 execute format('update public.%I set voided_at=now(),void_reason=$1 where id=$2 and organization_id=$3',target) using reason,record_id,org_id;
 get diagnostics affected=row_count;
 if affected<>1 then raise exception 'Record not available'; end if;
 return true;
end; $$;
revoke all on function public.void_financial_record(uuid,text,uuid,text) from public,anon;
grant execute on function public.void_financial_record(uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
