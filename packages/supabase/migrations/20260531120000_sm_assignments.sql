-- SM portal: site ownership on site_profiles + explicit guard assignments

alter table site_profiles
  add column if not exists assigned_sm_epf text;

create index if not exists idx_site_profiles_assigned_sm_epf
  on site_profiles (assigned_sm_epf)
  where assigned_sm_epf is not null;

create table if not exists sm_guard_assignments (
  id         uuid primary key default gen_random_uuid(),
  sm_epf     text not null,
  guard_epf  text not null,
  created_at timestamptz not null default now(),
  unique (sm_epf, guard_epf)
);

alter table sm_guard_assignments enable row level security;

create policy "service_role_all_sm_guard_assignments"
  on sm_guard_assignments for all using (auth.role() = 'service_role');
