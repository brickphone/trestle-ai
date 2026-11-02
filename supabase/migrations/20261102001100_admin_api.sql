-- Administrative setup only. These are not callable by ordinary authenticated users.
create function public.provision_staff(target_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Administrative access required' using errcode='42501'; end if;
 if exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=target_user and o.is_demo) then raise exception 'Demo accounts cannot become staff'; end if;
 insert into public.staff_users(user_id) values(target_user) on conflict do nothing;
 return true;
end; $$;
revoke all on function public.provision_staff(uuid) from public,anon,authenticated;
grant execute on function public.provision_staff(uuid) to service_role;

create function public.reset_demo(demo_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare org uuid; job uuid:=gen_random_uuid(); second uuid:=gen_random_uuid(); invoice uuid:=gen_random_uuid(); partial uuid:=gen_random_uuid(); rejected uuid:=gen_random_uuid(); suffix text:=substr(gen_random_uuid()::text,1,8); t text;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Administrative access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('product-demo-reset',0));
 if exists(select 1 from public.staff_users where user_id=demo_user_id) then raise exception 'Staff accounts cannot be demo accounts'; end if;
 if exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=demo_user_id and not o.is_demo) then raise exception 'Demo user belongs to a real organization'; end if;
 select id into org from public.organizations where is_demo;
 if org is null then
  insert into public.organizations(name,origin,plan,is_demo,onboarding_complete) values('Demo Construction · fictional','demo','pilot',true,true) returning id into org;
 else
  update public.government_invoices set status='accepted' where organization_id=org and status='paid';
  foreach t in array array['government_payments','government_invoices','change_orders','cash_balance_entries','recurring_costs','jobs'] loop
   execute format('update public.%I set voided_at=now(),void_reason=''Demo reset'' where organization_id=$1 and voided_at is null',t) using org;
  end loop;
  update public.forecast_assumptions set enabled=false where organization_id=org;
 end if;
 insert into public.memberships(organization_id,user_id,role) values(org,demo_user_id,'member') on conflict do nothing;
 insert into public.jobs(id,organization_id,contract_number,agency,description,contract_value_cents,start_date,end_date,retainage_bps,payment_terms_days,status) values
 (job,org,'DEMO-PAVING-'||suffix,'Fictional federal agency','Demo, fictional data · depot paving',100000000,current_date-60,current_date+240,500,14,'active'),
 (second,org,'DEMO-REPAIR-'||suffix,'Fictional federal agency','Demo, fictional data · facility repairs',32500000,current_date-30,current_date+120,0,14,'active');
 insert into public.change_orders(organization_id,job_id,reference,amount_cents,date,status,notes) values(org,job,'CO-01',5000000,current_date,'pending','Demo, fictional data · scope under review');
 insert into public.government_invoices(id,organization_id,job_id,invoice_number,period_start,period_end,billed_cents,retainage_cents,submitted_date,proper_receipt_date,expected_payment_date,expected_retainage_date,payment_terms_days,portal,status,rejection_reason) values
 (invoice,org,job,'DEMO-001',current_date-30,current_date-1,10000000,500000,current_date-4,current_date-3,current_date+11,current_date+270,14,'WAWF/PIEE','accepted',null),
 (partial,org,second,'DEMO-002',current_date-30,current_date-1,5000000,0,current_date-20,current_date-19,current_date+3,null,14,'IPP','accepted',null),
 (rejected,org,job,'DEMO-003',current_date-60,current_date-31,4000000,200000,current_date-15,null,null,null,14,'other','rejected','Demo, fictional data · missing supporting schedule');
 insert into public.government_payments(organization_id,invoice_id,received_date,amount_cents,kind,reference) values(org,partial,current_date-2,2000000,'progress','Demo partial receipt');
 insert into public.cash_balance_entries(organization_id,amount_cents,as_of_date) values(org,6500000,current_date);
 insert into public.recurring_costs(organization_id,job_id,label,category,amount_cents,frequency,start_date) values(org,job,'Demo weekly payroll','payroll',1200000,'weekly',current_date+2),(org,null,'Demo overhead','other',400000,'monthly',current_date+5);
 insert into public.forecast_assumptions(organization_id,job_id,enabled,cost_ratio_bps,cost_profile,duration_months,payment_lag_days,retainage_release_days,cost_mode) values(org,job,true,8500,'even',10,45,60,'explicit');
 return org;
end; $$;
revoke all on function public.reset_demo(uuid) from public,anon,authenticated;
grant execute on function public.reset_demo(uuid) to service_role;
notify pgrst,'reload schema';
