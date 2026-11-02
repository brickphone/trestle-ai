create table app.source_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 external_id text not null, source_url text not null, original jsonb not null, fetched_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,external_id)
);
create table app.jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 source_snapshot_id uuid, contract_number text not null, agency text, description text,
 contract_value_cents bigint check(contract_value_cents between 0 and 1000000000000),
 start_date date, end_date date, retainage_bps integer not null check(retainage_bps between 0 and 10000),
 payment_terms_days integer not null check(payment_terms_days between 0 and 365),
 status text not null default 'active' check(status in ('planned','active','complete','closed')),
 voided_at timestamptz, void_reason text, created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,contract_number),
 foreign key(organization_id,source_snapshot_id) references app.source_snapshots(organization_id,id),
 check(end_date is null or start_date is null or end_date>=start_date),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
create table app.change_orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 job_id uuid not null, reference text not null, amount_cents bigint not null check(abs(amount_cents)<=1000000000000), date date not null,
 status text not null check(status in ('pending','approved','rejected')), notes text,
 voided_at timestamptz, void_reason text, created_at timestamptz not null default now(),
 unique(organization_id,id), foreign key(organization_id,job_id) references app.jobs(organization_id,id),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
