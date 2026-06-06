-- Deductions Admin: meal suppliers, site assignments, monthly uniform/meals entries

create table if not exists meal_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  address text,
  phone text,
  bank_name text,
  bank_branch text,
  account_name text,
  account_number text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_suppliers_company_status_idx
  on meal_suppliers (company_id, status);

create table if not exists site_meal_supplier_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_profile_id uuid not null references site_profiles (id) on delete cascade,
  meal_supplier_id uuid not null references meal_suppliers (id) on delete restrict,
  notes text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_profile_id)
);

create index if not exists site_meal_supplier_assignments_company_idx
  on site_meal_supplier_assignments (company_id);

create table if not exists payroll_monthly_deduction_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  payroll_month date not null,
  uniform_amount_lkr numeric(12, 2) not null default 0,
  meals_amount_lkr numeric(12, 2) not null default 0,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED')),
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, payroll_month)
);

create index if not exists payroll_monthly_deduction_entries_month_idx
  on payroll_monthly_deduction_entries (company_id, payroll_month, status);

alter table payroll_deductions
  add column if not exists approval_status text default 'APPROVED'
    check (approval_status in ('PENDING', 'APPROVED', 'REJECTED'));

comment on table meal_suppliers is 'Canteen / meal vendors for guard payroll recoveries';
comment on table site_meal_supplier_assignments is 'Current meal supplier per site (one active assignment)';
comment on table payroll_monthly_deduction_entries is 'HQ admin monthly uniform and meals deduction amounts per guard';
