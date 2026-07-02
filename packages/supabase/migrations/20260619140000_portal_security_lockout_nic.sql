-- Portal security: NIC usernames, lockouts, notifications, unlock codes, Forge operator auth.

alter table head_office_portal_auth
  add column if not exists login_username text,
  add column if not exists portal_auth_email text,
  add column if not exists unlock_code_hash text,
  add column if not exists failed_password_attempts integer not null default 0,
  add column if not exists failed_2fa_attempts integer not null default 0,
  add column if not exists is_username_locked boolean not null default false,
  add column if not exists locked_until timestamptz,
  add column if not exists od_timed_lock_strikes integer not null default 0,
  add column if not exists od_2fa_recovery_locked_until timestamptz;

create unique index if not exists head_office_portal_auth_login_username_key
  on head_office_portal_auth (lower(trim(login_username)))
  where login_username is not null and trim(login_username) <> '';

create unique index if not exists head_office_portal_auth_portal_email_key
  on head_office_portal_auth (lower(trim(portal_auth_email)))
  where portal_auth_email is not null and trim(portal_auth_email) <> '';

create table if not exists portal_security_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  target_employee_id uuid references employees(id) on delete set null,
  subject_employee_id uuid references employees(id) on delete cascade,
  event_type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portal_security_notifications_company_unread_idx
  on portal_security_notifications (company_id, created_at desc)
  where read_at is null;

alter table portal_security_notifications enable row level security;

create policy "service_role_all_portal_security_notifications"
  on portal_security_notifications for all using (auth.role() = 'service_role');

create table if not exists portal_login_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  portal_auth_email text,
  event_type text not null,
  device_label text,
  ip_address text,
  success boolean not null default false,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists portal_login_events_employee_created_idx
  on portal_login_events (employee_id, created_at desc);

alter table portal_login_events enable row level security;

create policy "service_role_all_portal_login_events"
  on portal_login_events for all using (auth.role() = 'service_role');

create table if not exists forge_portal_auth (
  operator_email text primary key,
  pin_hash text,
  unlock_code_hash text,
  totp_secret text,
  two_factor_enabled boolean not null default false,
  totp_backup_code_hashes jsonb not null default '[]'::jsonb,
  failed_password_attempts integer not null default 0,
  failed_2fa_attempts integer not null default 0,
  is_locked boolean not null default false,
  locked_until timestamptz,
  od_timed_lock_strikes integer not null default 0,
  od_2fa_recovery_locked_until timestamptz,
  recovery_email text,
  main_email text,
  updated_at timestamptz not null default now()
);

alter table forge_portal_auth enable row level security;

create policy "service_role_all_forge_portal_auth"
  on forge_portal_auth for all using (auth.role() = 'service_role');
