-- Separate branches avoid resolving NEW.job_id when the trigger fires on jobs.
create or replace function app.check_contract_value() returns trigger language plpgsql set search_path='' as $$
declare target uuid; base bigint; adjustments bigint;
begin
 if TG_TABLE_NAME='jobs' then target:=new.id; else target:=new.job_id; end if;
 select contract_value_cents into base from public.jobs where id=target and organization_id=new.organization_id for no key update;
 select coalesce(sum(amount_cents),0) into adjustments from public.change_orders where job_id=target and status='approved' and voided_at is null;
 if base is not null and base+adjustments<0 then raise exception 'Approved changes exceed the contract value'; end if;
 return new;
end; $$;
revoke all on function app.check_contract_value() from public,anon,authenticated;
