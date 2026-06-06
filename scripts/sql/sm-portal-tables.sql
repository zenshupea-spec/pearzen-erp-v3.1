-- Paste this entire file into Supabase → SQL Editor → Run
-- (Do NOT type npm commands here — those run in your Mac terminal only.)

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

drop policy if exists "service_role_all_sm_guard_assignments" on sm_guard_assignments;
create policy "service_role_all_sm_guard_assignments"
  on sm_guard_assignments for all using (auth.role() = 'service_role');

create table if not exists sm_guard_attendance (
  id          uuid primary key default gen_random_uuid(),
  sm_epf      text not null,
  shift_date  date not null,
  shift_type  text not null default 'DAY'
              check (shift_type in ('DAY', 'NIGHT')),
  site_name   text not null,
  guard_epf   text not null,
  status      text not null default 'SUBMITTED'
              check (status in ('SUBMITTED', 'CONFIRMED', 'CANCELLED')),
  created_at  timestamptz not null default now(),
  unique (sm_epf, shift_date, shift_type, guard_epf)
);

create index if not exists idx_sm_guard_attendance_epf_date
  on sm_guard_attendance (sm_epf, shift_date);

alter table sm_guard_attendance enable row level security;

drop policy if exists "service_role_all_sm_guard_attendance" on sm_guard_attendance;
create policy "service_role_all_sm_guard_attendance"
  on sm_guard_attendance for all using (auth.role() = 'service_role');
