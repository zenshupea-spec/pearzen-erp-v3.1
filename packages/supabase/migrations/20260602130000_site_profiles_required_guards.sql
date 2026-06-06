-- Add required guard headcount to site_profiles
-- Used by SM portal to detect and flag understaffed sites

alter table site_profiles
  add column if not exists required_guards integer not null default 1
  check (required_guards >= 0);
