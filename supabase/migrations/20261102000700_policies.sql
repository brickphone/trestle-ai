-- No anon policies. Demo membership grants reads, but can_write_org always denies writes.
do $$ declare t text; begin
 foreach t in array array['source_snapshots','jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions'] loop
  execute format('alter table app.%I enable row level security',t);
  execute format('alter table app.%I force row level security',t);
  execute format('create policy tenant_read on app.%I for select to app_request using(app.can_read_org(organization_id))',t);
  execute format('create policy tenant_insert on app.%I for insert to app_request with check(app.can_write_org(organization_id))',t);
  execute format('grant select,insert on app.%I to app_request',t);
  if t<>'source_snapshots' then
   execute format('create policy tenant_update on app.%I for update to app_request using(app.can_write_org(organization_id)) with check(app.can_write_org(organization_id))',t);
   execute format('grant update on app.%I to app_request',t);
  end if;
  execute format('create trigger audit_financial after insert or update or delete on app.%I for each row execute function app.audit_financial()',t);
 end loop;
end $$;
-- Tenant IDs never change, even between two organizations the user belongs to.
create function app.immutable_org() returns trigger language plpgsql set search_path = '' as $$
begin if new.organization_id<>old.organization_id then raise exception 'Organization is immutable'; end if; return new; end; $$;
do $$ declare t text; begin
 foreach t in array array['jobs','change_orders','government_invoices','government_payments','cash_balance_entries','recurring_costs','forecast_assumptions'] loop
 execute format('create trigger immutable_org before update on app.%I for each row execute function app.immutable_org()',t);
 end loop;
end $$;
-- Revoke PostgreSQL's default PUBLIC function execution, including future functions.
revoke all on all functions in schema app from public,anon,authenticated;
grant execute on function app.is_staff(),app.is_member(uuid),app.can_read_org(uuid),app.can_write_org(uuid),app.is_owner(uuid),app.create_organization(text,text,text) to app_request;
create index audit_org_date on app.audit_events(organization_id,created_at desc);
create index jobs_org on app.jobs(organization_id);
create index invoices_org_job on app.government_invoices(organization_id,job_id);
create index payments_org_invoice on app.government_payments(organization_id,invoice_id);
create index changes_org_job on app.change_orders(organization_id,job_id);
