-- Uniform suppliers and HQ stock levels (low-stock vs active headcount / 10)

create table if not exists uniform_suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  address text,
  phone text,
  email text,
  bank_name text,
  bank_branch text,
  account_name text,
  account_number text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uniform_suppliers_company_status_idx
  on uniform_suppliers (company_id, status);

create table if not exists uniform_stock_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  uniform_supplier_id uuid not null references uniform_suppliers (id) on delete restrict,
  item_name text not null,
  sku text,
  quantity_in_stock integer not null default 0 check (quantity_in_stock >= 0),
  unit_cost_lkr numeric(12, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, item_name)
);

create index if not exists uniform_stock_items_company_idx
  on uniform_stock_items (company_id);

comment on table uniform_suppliers is 'Vendors for uniform inventory replenishment';
comment on table uniform_stock_items is 'HQ uniform stock on hand, linked to supplier';
