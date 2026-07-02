-- HR offboarding: uniform return collection cases (HR requests, Deductions Admin confirms)

create table if not exists uniform_collection_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  guard_epf text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CONFIRMED', 'CANCELLED')),
  issued_items jsonb not null default '[]'::jsonb,
  returned_items jsonb not null default '[]'::jsonb,
  admin_notes text,
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users (id),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uniform_collection_cases_company_status_idx
  on uniform_collection_cases (company_id, status, requested_at desc);

create index if not exists uniform_collection_cases_employee_idx
  on uniform_collection_cases (employee_id, requested_at desc);

create unique index if not exists uniform_collection_cases_one_pending_per_employee
  on uniform_collection_cases (employee_id)
  where status = 'PENDING';

comment on table uniform_collection_cases is
  'Offboarding uniform return queue: HR requests collection; Deductions Admin confirms returned vs issued items.';

alter table uniform_collection_cases enable row level security;

do $$ begin
  create policy company_users_uniform_collection_cases on uniform_collection_cases
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
  create policy service_role_uniform_collection_cases on uniform_collection_cases
    for all using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
