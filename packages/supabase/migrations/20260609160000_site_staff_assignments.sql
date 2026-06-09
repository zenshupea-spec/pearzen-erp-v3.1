-- Café / head-office staff linked to site_profiles (many staff per internal site).

create table if not exists site_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  site_profile_id uuid not null references site_profiles (id) on delete cascade,
  staff_epf text not null,
  created_at timestamptz not null default now(),
  unique (site_profile_id, staff_epf)
);

create index if not exists idx_site_staff_assignments_site
  on site_staff_assignments (site_profile_id);

create index if not exists idx_site_staff_assignments_epf
  on site_staff_assignments (staff_epf)
  where staff_epf is not null;

alter table site_staff_assignments enable row level security;

do $$ begin
  create policy service_role_site_staff_assignments
    on site_staff_assignments for all
    using (auth.role() = 'service_role');
exception when duplicate_object then null;
end $$;
