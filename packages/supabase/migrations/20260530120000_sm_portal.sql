-- SM Portal: auth state, visit logs, trips, attendance, incidents, penalties, uniforms

-- ─────────────────────────────────────────────────────────────────
-- 1. SM Portal Auth State
--    Tracks OTP/PIN lifecycle. Supabase Auth holds the actual
--    password hash; this table only holds provisioning metadata.
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_portal_auth (
  epf_number      text primary key,
  current_otp     text,           -- plain OTP shown to HR, cleared after first use
  needs_pin_setup boolean not null default true,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- 2. SM Visit Logs  (site visits + fuel-trackable incident trips)
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_visit_logs (
  id          uuid primary key default gen_random_uuid(),
  sm_epf      text not null,
  visit_type  text not null check (visit_type in ('VISIT', 'INCIDENT_TRIP')),
  site_name   text,
  notes       text,
  km_claimed  numeric(8,2),
  fuel_amount numeric(10,2),
  latitude    numeric(10,6),
  longitude   numeric(10,6),
  created_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- 3. SM Attendance Submissions (T+3 advance submissions)
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_attendance_submissions (
  id           uuid primary key default gen_random_uuid(),
  sm_epf       text not null,
  shift_date   date not null,
  shift_type   text not null check (shift_type in ('DAY', 'NIGHT', 'SPLIT', 'REST')),
  site_name    text,
  notes        text,
  status       text not null default 'SUBMITTED'
               check (status in ('SUBMITTED', 'CONFIRMED', 'CANCELLED')),
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (sm_epf, shift_date)
);

-- ─────────────────────────────────────────────────────────────────
-- 4. SM Incident Reports
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_incident_reports (
  id               uuid primary key default gen_random_uuid(),
  sm_epf           text not null,
  site_name        text,
  incident_type    text not null
                   check (incident_type in (
                     'SECURITY_BREACH', 'GUARD_MISCONDUCT', 'EQUIPMENT_FAILURE',
                     'MEDICAL_EMERGENCY', 'THEFT', 'TRESPASSING', 'PROPERTY_DAMAGE',
                     'CLIENT_COMPLAINT', 'NATURAL_DISASTER', 'OTHER'
                   )),
  severity         text not null default 'MEDIUM'
                   check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description      text not null,
  guards_involved  text[],
  action_taken     text,
  status           text not null default 'OPEN'
                   check (status in ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'ESCALATED')),
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- 5. SM Guard Penalties
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_guard_penalties (
  id           uuid primary key default gen_random_uuid(),
  sm_epf       text not null,
  guard_epf    text not null,
  guard_name   text,
  penalty_type text not null
               check (penalty_type in (
                 'LATE_ARRIVAL', 'ABSENT_WITHOUT_NOTICE', 'UNIFORM_VIOLATION',
                 'INSUBORDINATION', 'NEGLIGENCE', 'POST_ABANDONMENT', 'OTHER'
               )),
  reason       text not null,
  shift_date   date,
  site_name    text,
  deduction_amount numeric(10,2),
  status       text not null default 'PENDING'
               check (status in ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED')),
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- 6. SM Uniform Requests / Issues
-- ─────────────────────────────────────────────────────────────────
create table if not exists sm_uniform_requests (
  id             uuid primary key default gen_random_uuid(),
  sm_epf         text not null,
  guard_epf      text not null,
  guard_name     text,
  request_type   text not null check (request_type in ('ISSUE', 'REQUEST_REPLACEMENT')),
  items          jsonb not null default '[]'::jsonb,
  site_name      text,
  notes          text,
  status         text not null default 'PENDING'
                 check (status in ('PENDING', 'APPROVED', 'ISSUED', 'REJECTED')),
  created_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────
-- RLS: allow service role full access; authenticated users scoped
-- ─────────────────────────────────────────────────────────────────
alter table sm_portal_auth        enable row level security;
alter table sm_visit_logs         enable row level security;
alter table sm_attendance_submissions enable row level security;
alter table sm_incident_reports   enable row level security;
alter table sm_guard_penalties    enable row level security;
alter table sm_uniform_requests   enable row level security;

-- Service role bypasses RLS by default. For anon/authenticated, deny by default.
-- (Fine-grained policies added when role claims are established.)
create policy "service_role_all_sm_portal_auth"
  on sm_portal_auth for all using (auth.role() = 'service_role');

create policy "service_role_all_sm_visit_logs"
  on sm_visit_logs for all using (auth.role() = 'service_role');

create policy "service_role_all_sm_attendance"
  on sm_attendance_submissions for all using (auth.role() = 'service_role');

create policy "service_role_all_sm_incidents"
  on sm_incident_reports for all using (auth.role() = 'service_role');

create policy "service_role_all_sm_penalties"
  on sm_guard_penalties for all using (auth.role() = 'service_role');

create policy "service_role_all_sm_uniforms"
  on sm_uniform_requests for all using (auth.role() = 'service_role');
