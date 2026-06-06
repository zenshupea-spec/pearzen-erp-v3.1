-- OM workflow: MD-requested field GPS capture + audit of who set coordinates

alter table site_profiles
  add column if not exists needs_om_gps_capture boolean not null default false,
  add column if not exists location_captured_at timestamptz,
  add column if not exists location_captured_by text;

create index if not exists idx_site_profiles_needs_om_gps
  on site_profiles (needs_om_gps_capture)
  where needs_om_gps_capture = true;
