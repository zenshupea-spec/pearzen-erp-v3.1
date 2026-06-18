-- One-time TOTP backup codes for Head Office portal 2FA recovery.

alter table head_office_portal_auth
  add column if not exists totp_backup_code_hashes jsonb not null default '[]'::jsonb;
