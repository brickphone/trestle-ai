create table app.cash_balance_entries (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 job_id uuid, amount_cents bigint not null check(abs(amount_cents)<=1000000000000), as_of_date date not null,
 voided_at timestamptz, void_reason text, created_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,job_id) references app.jobs(organization_id,id),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
create table app.recurring_costs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations,
 job_id uuid, label text not null, category text not null check(category in ('payroll','other')),
 amount_cents bigint not null check(amount_cents between 1 and 1000000000000), frequency text not null check(frequency in ('weekly','monthly')),
 start_date date not null, end_date date, voided_at timestamptz, void_reason text, created_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,job_id) references app.jobs(organization_id,id), check(end_date is null or end_date>=start_date),
 check((voided_at is null and void_reason is null) or (voided_at is not null and void_reason is not null and length(trim(void_reason))>0))
);
create table app.forecast_assumptions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references app.organizations, job_id uuid not null,
 enabled boolean not null default false, cost_ratio_bps integer not null check(cost_ratio_bps between 0 and 100000),
 cost_profile text not null check(cost_profile in ('even','front-loaded')), duration_months integer not null check(duration_months between 1 and 1200),
 payment_lag_days integer not null check(payment_lag_days between 0 and 36500), retainage_release_days integer not null check(retainage_release_days between 0 and 36500),
 cost_mode text not null check(cost_mode in ('explicit','modeled')), created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,job_id), foreign key(organization_id,job_id) references app.jobs(organization_id,id)
);
