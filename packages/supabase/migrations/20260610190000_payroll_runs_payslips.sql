-- Monthly payroll runs with maker-checker status and duplicate-safe payslips

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  period_year int not null check (period_year >= 2000 and period_year <= 2100),
  period_month int not null check (period_month between 1 and 12),
  group_id text not null check (group_id in ('security', 'cafe')),
  batch_id text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID')),
  payslip_count int not null default 0,
  gross_total numeric(14, 2) not null default 0,
  net_total numeric(14, 2) not null default 0,
  submitted_at timestamptz,
  submitted_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_year, period_month, group_id)
);

create index if not exists payroll_runs_period_idx
  on payroll_runs (company_id, period_year, period_month);

comment on table payroll_runs is
  'One payroll run per company, month, and workforce group (security vs cafe). Status gates regenerate and bank export.';

-- Payslips may already exist from earlier FM work — extend in place.
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references employees (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  period_year int not null check (period_year >= 2000 and period_year <= 2100),
  period_month int not null check (period_month between 1 and 12),
  adjusted_basic numeric(12, 2) not null default 0,
  gross_pay numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  epf_employee numeric(12, 2) not null default 0,
  epf_employer numeric(12, 2) not null default 0,
  etf numeric(12, 2) not null default 0,
  status text not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payslips add column if not exists payroll_run_id uuid references payroll_runs (id) on delete set null;
alter table payslips add column if not exists period_year int;
alter table payslips add column if not exists period_month int;
alter table payslips add column if not exists adjusted_basic numeric(12, 2) not null default 0;
alter table payslips add column if not exists gross_pay numeric(12, 2) not null default 0;
alter table payslips add column if not exists net_pay numeric(12, 2) not null default 0;
alter table payslips add column if not exists epf_employee numeric(12, 2) not null default 0;
alter table payslips add column if not exists epf_employer numeric(12, 2) not null default 0;
alter table payslips add column if not exists etf numeric(12, 2) not null default 0;
alter table payslips add column if not exists status text not null default 'DRAFT';
alter table payslips add column if not exists created_at timestamptz not null default now();
alter table payslips add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'payslips_status_check'
  ) then
    alter table payslips
      add constraint payslips_status_check
      check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID'));
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payslips_employee_period_unique'
  ) then
    alter table payslips
      add constraint payslips_employee_period_unique
      unique (profile_id, company_id, period_year, period_month);
  end if;
end $$;

create index if not exists payslips_run_idx on payslips (payroll_run_id);
create index if not exists payslips_period_idx
  on payslips (company_id, period_year, period_month);

comment on table payslips is
  'Monthly payslip per employee. Unique per employee+company+period prevents double payment.';

alter table payroll_runs enable row level security;
alter table payslips enable row level security;

do $$ begin
  create policy service_role_payroll_runs on payroll_runs
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_payslips on payslips
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
