-- Reopen setup in place. No jobs, invoices, payments, or source snapshots are removed.
create function public.update_company_setup(org_id uuid,setup_values jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare organization public.organizations; input jsonb; tracked public.jobs;
 old_balance public.cash_balance_entries; row_cost public.recurring_costs; kind text; labels text[];
 amount bigint; current_amount bigint; new_balance bigint; balance_day date; new_label text;
begin
 if not app.is_owner(org_id) or not app.can_write_org(org_id) then raise exception 'Read-only account' using errcode='42501'; end if;
 select * into organization from public.organizations where id=org_id for update;
 if not found then raise exception 'Company not available'; end if;
 if nullif(setup_values->>'uei','') is distinct from organization.uei then raise exception 'The company UEI cannot be changed through setup'; end if;
 if jsonb_typeof(setup_values->'jobs') is distinct from 'array' or jsonb_array_length(setup_values->'jobs')>1000 then raise exception 'Invalid job inputs'; end if;
 update public.organizations set name=setup_values->>'name' where id=org_id;
 for input in select value from jsonb_array_elements(setup_values->'jobs') loop
  select * into tracked from public.jobs where organization_id=org_id and id=(input->>'id')::uuid and voided_at is null for update;
  if not found then raise exception 'Job does not belong to this company'; end if;
  insert into public.forecast_assumptions as saved(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode,billed_before_tracking_cents,billed_through_date)
  values(org_id,tracked.id,true,(setup_values->>'defaultCostRatioBps')::integer,'even',1,(input->>'paymentLagDays')::integer,0,'modeled',(input->>'billedCents')::bigint,current_date)
  on conflict(organization_id,job_id) do update set billed_before_tracking_cents=excluded.billed_before_tracking_cents,payment_lag_days=excluded.payment_lag_days,billed_through_date=coalesce(saved.billed_through_date,excluded.billed_through_date) where saved.billed_before_tracking_cents is distinct from excluded.billed_before_tracking_cents or saved.payment_lag_days is distinct from excluded.payment_lag_days or saved.billed_through_date is null;
 end loop;
 new_balance:=(setup_values->>'openingBalanceCents')::bigint;
 balance_day:=(setup_values->>'balanceDate')::date;
 if new_balance is not null then
  if balance_day is null or balance_day>current_date then raise exception 'Invalid balance date'; end if;
  select * into old_balance from public.cash_balance_entries where organization_id=org_id and job_id is null and voided_at is null order by created_at desc,id desc limit 1;
  if old_balance.id is null or old_balance.amount_cents is distinct from new_balance or old_balance.as_of_date is distinct from balance_day then
   insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date) values(org_id,new_balance,balance_day);
  end if;
 end if;
 foreach kind in array array['monthly','weekly'] loop
  amount:=case when kind='monthly' then (setup_values->>'monthlyCents')::bigint else (setup_values->>'payrollCents')::bigint end;
  if amount is null then continue; end if;
  if amount<0 or amount>1000000000000 then raise exception 'Invalid overhead amount'; end if;
  labels:=case when kind='monthly' then array['Monthly overhead','Other monthly costs'] else array['Weekly office payroll'] end;
  new_label:=case when kind='monthly' then 'Monthly overhead' else 'Weekly office payroll' end;
  select coalesce(sum(amount_cents),0) into current_amount from public.recurring_costs where organization_id=org_id and job_id is null and cost_scope='overhead' and frequency=kind and label=any(labels) and voided_at is null and start_date<=current_date and (end_date is null or end_date>=current_date);
  if amount=current_amount then continue; end if;
  for row_cost in select * from public.recurring_costs where organization_id=org_id and job_id is null and cost_scope='overhead' and frequency=kind and label=any(labels) and voided_at is null and start_date<=current_date and (end_date is null or end_date>=current_date) for update loop
   if row_cost.start_date<current_date then update public.recurring_costs set end_date=current_date-1 where id=row_cost.id and organization_id=org_id;
   else update public.recurring_costs set voided_at=now(),void_reason='Company setup updated' where id=row_cost.id and organization_id=org_id; end if;
  end loop;
  if amount>0 then insert into public.recurring_costs(organization_id,label,category,amount_cents,frequency,start_date,cost_scope) values(org_id,new_label,case when kind='monthly' then 'other' else 'payroll' end,amount,kind,current_date,'overhead'); end if;
 end loop;
 delete from public.onboarding_drafts where user_id=auth.uid() and draft->>'editingOrganizationId'=org_id::text;
 return org_id;
end; $$;
revoke all on function public.update_company_setup(uuid,jsonb) from public,anon;
grant execute on function public.update_company_setup(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
