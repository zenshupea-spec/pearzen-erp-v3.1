-- Company-wide default check-in geofence (meters) for new sites; MD sets per-site override at registration.

alter table md_settings
  add column if not exists default_geofence_radius_m integer not null default 25;

alter table md_settings
  drop constraint if exists md_settings_default_geofence_radius_m_check;

alter table md_settings
  add constraint md_settings_default_geofence_radius_m_check
  check (default_geofence_radius_m >= 25 and default_geofence_radius_m <= 500);
