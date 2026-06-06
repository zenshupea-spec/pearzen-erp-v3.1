-- Per-holder (VO) uniform stock — deducted when issuing from stock in TM / OM / SM / HQ portals

create table if not exists uniform_vo_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  holder_epf text not null,
  item_name text not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, holder_epf, item_name)
);

create index if not exists uniform_vo_stock_holder_idx
  on uniform_vo_stock (company_id, holder_epf);

comment on table uniform_vo_stock is 'Uniform stock allocated to a VO (TM/SM/OM/admin EPF); issues deduct from here';
