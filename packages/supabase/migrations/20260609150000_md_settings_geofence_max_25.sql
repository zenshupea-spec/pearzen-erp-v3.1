-- Geofence radius cap: allow 1–25 m (was 25–500 m).

alter table md_settings
  drop constraint if exists md_settings_default_geofence_radius_m_check;

alter table md_settings
  add constraint md_settings_default_geofence_radius_m_check
  check (default_geofence_radius_m >= 1 and default_geofence_radius_m <= 25);

update md_settings
set default_geofence_radius_m = least(default_geofence_radius_m, 25)
where default_geofence_radius_m > 25;

update site_profiles
set geofence_radius = least(geofence_radius, 25)
where geofence_radius > 25;
