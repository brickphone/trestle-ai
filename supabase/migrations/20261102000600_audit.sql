create table app.audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 actor_id uuid, operation text not null, table_name text not null, record_id uuid not null,
 before_value jsonb, after_value jsonb, created_at timestamptz not null default now()
);
alter table app.audit_events enable row level security;
alter table app.audit_events force row level security;
create policy audit_read on app.audit_events for select to app_request using(app.can_read_org(organization_id));
create function app.audit_financial() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into app.audit_events(organization_id,actor_id,operation,table_name,record_id,before_value,after_value)
 values(coalesce(new.organization_id,old.organization_id),auth.uid(),TG_OP,TG_TABLE_NAME,coalesce(new.id,old.id),
 case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end; $$;
create function app.immutable_audit() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Audit events are append-only'; end; $$;
create trigger immutable_audit before update or delete on app.audit_events for each row execute function app.immutable_audit();
grant select on app.audit_events to app_request;
