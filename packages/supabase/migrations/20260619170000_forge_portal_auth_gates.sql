-- Forge operator portal auth gates (PIN setup flag, temp password audit).

alter table forge_portal_auth
  add column if not exists needs_pin_setup boolean not null default false,
  add column if not exists temp_password_issued_at timestamptz;
