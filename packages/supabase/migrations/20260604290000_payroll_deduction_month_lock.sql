-- HQ Deductions Admin: monthly lock sent to FM before payroll batch lock

create table if not exists payroll_deduction_month_locks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  payroll_month date not null,
  locked_at timestamptz not null default now(),
  locked_by uuid,
  unique (company_id, payroll_month)
);

create index if not exists payroll_deduction_month_locks_month_idx
  on payroll_deduction_month_locks (company_id, payroll_month);

comment on table payroll_deduction_month_locks is
  'HQ deductions admin locked a payroll month for FM — FM cannot lock payroll until this exists';
