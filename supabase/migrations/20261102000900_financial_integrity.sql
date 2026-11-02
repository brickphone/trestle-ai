-- Changes never turn an entered contract value negative. Serialize with job edits.
create function app.check_contract_value() returns trigger language plpgsql set search_path = '' as $$
declare target uuid; base bigint; adjustments bigint;
begin
 target:=case when TG_TABLE_NAME='jobs' then new.id else new.job_id end;
 select contract_value_cents into base from app.jobs where id=target and organization_id=new.organization_id for update;
 select coalesce(sum(amount_cents),0) into adjustments from app.change_orders where job_id=target and status='approved' and voided_at is null;
 if base is not null and base+adjustments<0 then raise exception 'Approved changes exceed the contract value'; end if;
 return new;
end; $$;
revoke all on function app.check_contract_value() from public,anon,authenticated,app_request;
create trigger change_contract_value after insert or update on app.change_orders for each row execute function app.check_contract_value();
create trigger job_contract_value after update on app.jobs for each row execute function app.check_contract_value();
