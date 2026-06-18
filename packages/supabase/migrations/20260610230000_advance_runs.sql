-- FM advance salary batches: maker-checker workflow per pinned payroll group.

create table if not exists advance_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  period_year int not null check (period_year >= 2000 and period_year <= 2100),
  period_month int not null check (period_month between 1 and 12),
  group_id text not null check (
    group_id in ('ho', 'sm', 'cafe', 'guard_commercial', 'guard_other_bank')
  ),
  batch_id text not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID')),
  selection_count int not null default 0,
  total_amount numeric(14, 2) not null default 0,
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

create index if not exists advance_runs_period_idx
  on advance_runs (company_id, period_year, period_month);

comment on table advance_runs is
  'One advance salary batch per company, month, and pinned payroll group. Gates MD approval and bank export.';

alter table advance_runs enable row level security;

do $$ begin
  create policy service_role_advance_runs on advance_runs
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;

-- Extend salary_advances status for FM maker-checker workflow.
alter table salary_advances drop constraint if exists salary_advances_status_check;

update salary_advances
set status = 'DRAFT'
where status = 'PENDING';

alter table salary_advances
  add constraint salary_advances_status_check
  check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'PENDING'));

comment on column salary_advances.status is
  'DRAFT = FM saved selections; SUBMITTED = with MD; APPROVED = MD approved (deducted on payroll).';
