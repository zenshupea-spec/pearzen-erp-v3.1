-- Head Office Google workspace portal auth (OTP / PIN lifecycle).

create table if not exists head_office_portal_auth (
  employee_id     uuid primary key references employees(id) on delete cascade,
  work_email      text not null,
  pin_hash        text,
  current_otp     text,
  needs_pin_setup boolean not null default true,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists head_office_portal_auth_work_email_key
  on head_office_portal_auth (lower(trim(work_email)));

alter table head_office_portal_auth enable row level security;

create policy "service_role_all_head_office_portal_auth"
  on head_office_portal_auth for all using (auth.role() = 'service_role');
