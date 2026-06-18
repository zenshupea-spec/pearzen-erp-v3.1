-- FM advance salary selections: one approved advance per employee per payroll month.
-- Legacy HR desk may already have salary_advances without payroll-period columns.

create table if not exists salary_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  profile_id uuid not null references employees (id) on delete cascade,
  emp_number text not null,
  amount numeric(12, 2) not null check (amount > 0),
  period_year int not null check (period_year >= 2000 and period_year <= 2100),
  period_month int not null check (period_month between 1 and 12),
  payroll_group text,
  status text not null default 'APPROVED'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reason text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, profile_id, period_year, period_month)
);

-- Backfill columns when the table predates FM payroll-period scoping.
alter table salary_advances add column if not exists period_year int;
alter table salary_advances add column if not exists period_month int;
alter table salary_advances add column if not exists payroll_group text;
alter table salary_advances add column if not exists created_by uuid;
alter table salary_advances add column if not exists updated_at timestamptz default now();

update salary_advances
set
  period_year = coalesce(
    period_year,
    extract(year from coalesce(created_at, now()))::int
  ),
  period_month = coalesce(
    period_month,
    extract(month from coalesce(created_at, now()))::int
  ),
  updated_at = coalesce(updated_at, created_at, now())
where period_year is null
   or period_month is null
   or updated_at is null;

alter table salary_advances alter column period_year set not null;
alter table salary_advances alter column period_month set not null;
alter table salary_advances alter column updated_at set default now();
alter table salary_advances alter column updated_at set not null;

do $$ begin
  alter table salary_advances
    add constraint salary_advances_period_year_check
    check (period_year >= 2000 and period_year <= 2100);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table salary_advances
    add constraint salary_advances_period_month_check
    check (period_month between 1 and 12);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table salary_advances
    add constraint salary_advances_status_check
    check (status in ('PENDING', 'APPROVED', 'REJECTED'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table salary_advances
    add constraint salary_advances_company_profile_period_key
    unique (company_id, profile_id, period_year, period_month);
exception when duplicate_object then null;
end $$;

create index if not exists salary_advances_period_idx
  on salary_advances (company_id, period_year, period_month, status);

create index if not exists salary_advances_emp_number_idx
  on salary_advances (emp_number, status);

comment on table salary_advances is
  'FM-selected salary advances per payroll month. Deducted on month-end payroll and shown on payslips.';

alter table salary_advances enable row level security;

do $$ begin
  create policy service_role_salary_advances on salary_advances
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
