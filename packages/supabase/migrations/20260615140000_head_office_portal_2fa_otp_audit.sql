-- Portal 2FA (TOTP) and OTP provisioning audit trail.

alter table head_office_portal_auth
  add column if not exists totp_secret text,
  add column if not exists two_factor_enabled boolean not null default false,
  add column if not exists last_otp_provisioned_at timestamptz,
  add column if not exists last_otp_provisioned_by_employee_id uuid references employees(id) on delete set null,
  add column if not exists last_otp_provisioned_by_name text,
  add column if not exists last_otp_provisioned_lat numeric(10, 6),
  add column if not exists last_otp_provisioned_lng numeric(10, 6),
  add column if not exists last_otp_provisioned_location_label text;
