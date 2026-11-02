create table app.government_invoices (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations, job_id uuid not null,
 invoice_number text not null, period_start date not null, period_end date not null,
 billed_cents bigint not null check(billed_cents between 1 and 1000000000000),
 retainage_cents bigint not null check(retainage_cents>=0 and retainage_cents<=billed_cents),
 submitted_date date, proper_receipt_date date, expected_payment_date date, expected_retainage_date date,
 payment_terms_days integer not null check(payment_terms_days between 0 and 365),
 portal text not null check(portal in ('WAWF/PIEE','IPP','other')),
 status text not null check(status in ('draft','submitted','accepted','rejected','paid')), rejection_reason text,
 resubmission_of_id uuid, voided_at timestamptz, void_reason text, created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,job_id,invoice_number),
 foreign key(organization_id,job_id) references app.jobs(organization_id,id),
 foreign key(organization_id,resubmission_of_id) references app.government_invoices(organization_id,id),
 check(period_end>=period_start), check(status='draft' or submitted_date is not null),
 check(status<>'rejected' or (rejection_reason is not null and length(trim(rejection_reason))>0)),
 check(proper_receipt_date is null or (submitted_date is not null and proper_receipt_date>=submitted_date)),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
create table app.government_payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 invoice_id uuid not null, received_date date not null, amount_cents bigint not null check(amount_cents between 1 and 1000000000000),
 kind text not null check(kind in ('progress','retainage')), reference text,
 voided_at timestamptz, void_reason text, created_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,invoice_id) references app.government_invoices(organization_id,id),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
-- Serialize payment/invoice edits. Limits hold even for direct SQL and concurrent submissions.
create function app.check_payment_balance() returns trigger language plpgsql set search_path = '' as $$
declare inv app.government_invoices; progress bigint; retained bigint;
begin
 if TG_TABLE_NAME='government_payments' then
   if TG_OP='UPDATE' and (new.invoice_id<>old.invoice_id or new.organization_id<>old.organization_id) then raise exception 'Payment link is immutable'; end if;
   select * into inv from app.government_invoices where id=new.invoice_id and organization_id=new.organization_id for update;
   if not found or inv.status in ('draft','rejected') or inv.voided_at is not null then raise exception 'Invoice is not payable'; end if;
   if new.voided_at is null and new.received_date<inv.submitted_date then raise exception 'Payment predates submission'; end if;
 else inv:=new; end if;
 select coalesce(sum(amount_cents) filter(where kind='progress'),0),coalesce(sum(amount_cents) filter(where kind='retainage'),0)
 into progress,retained from app.government_payments where invoice_id=inv.id and voided_at is null;
 if progress>inv.billed_cents-inv.retainage_cents or retained>inv.retainage_cents then raise exception 'Payment exceeds invoice balance'; end if;
 if inv.status='paid' and progress<>inv.billed_cents-inv.retainage_cents then raise exception 'Paid status requires full net payment'; end if;
 if (inv.voided_at is not null or inv.status in ('draft','rejected')) and progress+retained>0 then raise exception 'Void payments before changing invoice'; end if;
 return new;
end; $$;
create trigger payment_balance after insert or update on app.government_payments for each row execute function app.check_payment_balance();
create trigger invoice_balance after insert or update on app.government_invoices for each row execute function app.check_payment_balance();
create function app.invoice_transition() returns trigger language plpgsql set search_path = '' as $$
begin
 if TG_OP='UPDATE' then
  if old.organization_id<>new.organization_id or old.job_id<>new.job_id or old.resubmission_of_id is distinct from new.resubmission_of_id then raise exception 'Invoice links are immutable'; end if;
  if old.status='rejected' and (to_jsonb(new)-'voided_at'-'void_reason') is distinct from (to_jsonb(old)-'voided_at'-'void_reason') then raise exception 'Resubmit as a new invoice'; end if;
  if old.status<>new.status and not ((old.status='draft' and new.status='submitted') or (old.status='submitted' and new.status in ('accepted','rejected','paid')) or (old.status='accepted' and new.status in ('rejected','paid')) or (old.status='paid' and new.status='accepted')) then raise exception 'Invalid invoice transition'; end if;
 elsif new.resubmission_of_id is not null and not exists(select 1 from app.government_invoices where id=new.resubmission_of_id and organization_id=new.organization_id and job_id=new.job_id and status='rejected') then raise exception 'Resubmission requires rejected invoice on this job'; end if;
 return new;
end; $$;
create trigger invoice_transition before insert or update on app.government_invoices for each row execute function app.invoice_transition();
