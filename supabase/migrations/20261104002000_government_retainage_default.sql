-- Defaults only. Existing contract settings, invoice retainage and receipts are preserved.
alter table public.jobs alter column retainage_bps set default 0;
alter table public.government_invoices alter column retainage_cents set default 0;
create or replace function public.save_government_invoice(org_id uuid,invoice_id uuid,invoice_values jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare job public.jobs; original public.government_invoices; saved uuid; held bigint;
begin
 if not app.can_write_org(org_id) then raise exception 'Read-only account' using errcode='42501'; end if;
 select * into job from public.jobs where id=(invoice_values->>'job_id')::uuid and organization_id=org_id and voided_at is null for update;
 if not found then raise exception 'Job not available'; end if;
 held:=coalesce((invoice_values->>'retainage_cents')::bigint,0);
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

notify pgrst,'reload schema';
