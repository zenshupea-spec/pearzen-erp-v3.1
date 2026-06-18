-- FM-managed employee deduction installment plans (Death Donation, Salary Loan, etc.)

create table if not exists fm_employee_deduction_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  deduction_kind text not null check (
    deduction_kind in (
      'DEATH_DONATION',
      'WEDDING_GIFTS',
      'EXTRA_ITEMS',
      'UNIT_DAMAGES',
      'TRAINING',
      'SALARY_LOAN',
      'OTHER_DEDUCTIONS'
    )
  ),
  total_liability_lkr numeric(12, 2) not null check (total_liability_lkr > 0),
  installment_total integer not null check (installment_total >= 1),
  start_payroll_month date not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fm_employee_deduction_plans_employee_idx
  on fm_employee_deduction_plans (company_id, employee_id, status);

create unique index if not exists fm_employee_deduction_plans_one_active_per_kind
  on fm_employee_deduction_plans (company_id, employee_id, deduction_kind)
  where status = 'ACTIVE';

comment on table fm_employee_deduction_plans is
  'FM installment deduction schedules that carry forward each payroll month until completed';

alter table fm_employee_deduction_plans enable row level security;

do $$ begin
  create policy company_users_fm_employee_deduction_plans on fm_employee_deduction_plans
    for all
    using (
      company_id in (select company_id from users where id = auth.uid())
    )
    with check (
      company_id in (select company_id from users where id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy service_role_fm_employee_deduction_plans on fm_employee_deduction_plans
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
