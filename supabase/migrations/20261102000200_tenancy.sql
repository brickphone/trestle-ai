create table app.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 200),
 uei text check(uei is null or uei ~ '^[A-Z0-9]{12}$'), origin text not null default 'manual' check(origin in ('manual','usaspending','demo')),
 plan text not null default 'none' check(plan in ('none','pilot','paid')), is_demo boolean not null default false,
 onboarding_complete boolean not null default false, created_at timestamptz not null default now()
);
create unique index one_demo on app.organizations(is_demo) where is_demo;
create table app.memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 user_id uuid not null references auth.users, role text not null check(role in ('owner','member')),
 created_at timestamptz not null default now(), unique(organization_id,user_id)
);
create index memberships_user on app.memberships(user_id);
create table app.staff_users(user_id uuid primary key references auth.users, created_at timestamptz not null default now());
create function app.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.staff_users where user_id=auth.uid());
$$;
create function app.is_member(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.memberships where organization_id=org and user_id=auth.uid());
$$;
create function app.can_read_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select app.is_member(org) or app.is_staff();
$$;
create function app.can_write_org(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select app.is_member(org) and not app.is_staff() and not exists(select 1 from app.organizations where id=org and is_demo);
$$;
create function app.is_owner(org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from app.memberships where organization_id=org and user_id=auth.uid() and role='owner');
$$;
alter table app.organizations enable row level security;
alter table app.organizations force row level security;
alter table app.memberships enable row level security;
alter table app.memberships force row level security;
alter table app.staff_users enable row level security;
alter table app.staff_users force row level security;
create policy org_read on app.organizations for select to app_request using(app.can_read_org(id));
create policy org_update on app.organizations for update to app_request using(app.is_owner(id) and app.can_write_org(id)) with check(app.is_owner(id) and app.can_write_org(id));
create policy membership_read on app.memberships for select to app_request using(app.can_read_org(organization_id));
create policy staff_self on app.staff_users for select to app_request using(user_id=auth.uid());
create function app.create_organization(company_name text, company_uei text default null, company_origin text default 'manual') returns uuid
language plpgsql security definer set search_path = '' as $$
declare org uuid;
begin
 if auth.uid() is null or app.is_staff() then raise exception 'Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if exists(select 1 from app.memberships where user_id=auth.uid()) then raise exception 'Already belongs to an organization'; end if;
 if company_origin not in ('manual','usaspending') then raise exception 'Invalid origin'; end if;
 insert into app.organizations(name,uei,origin) values(company_name,company_uei,company_origin) returning id into org;
 insert into app.memberships(organization_id,user_id,role) values(org,auth.uid(),'owner');
 return org;
end; $$;
grant select on app.organizations,app.memberships,app.staff_users to app_request;
grant update(name,uei,onboarding_complete) on app.organizations to app_request;
