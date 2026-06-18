-- One-minute OTP window for portal provisioning flows.

alter table head_office_portal_auth
  add column if not exists otp_expires_at timestamptz;

alter table cafe_portal_auth
  add column if not exists otp_expires_at timestamptz;

alter table sm_portal_auth
  add column if not exists otp_expires_at timestamptz;
