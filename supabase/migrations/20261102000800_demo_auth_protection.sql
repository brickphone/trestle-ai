-- A public one-click demo session must not be able to change the shared login.
create function app.protect_demo_login() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if (new.email is distinct from old.email or new.encrypted_password is distinct from old.encrypted_password or new.phone is distinct from old.phone)
 and exists(select 1 from app.memberships m join app.organizations o on o.id=m.organization_id where m.user_id=old.id and o.is_demo)
 then raise exception 'Demo credentials are managed administratively'; end if;
 return new;
end; $$;
revoke all on function app.protect_demo_login() from public,anon,authenticated,app_request;
create trigger protect_demo_login before update on auth.users for each row execute function app.protect_demo_login();
