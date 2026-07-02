-- Partial md_settings upserts (e.g. penalty_catalog only) INSERT with column DEFAULT 150 m
-- while md_settings_default_geofence_radius_m_check allows only 1–25 m.

alter table md_settings
  alter column default_geofence_radius_m set default 25;

update md_settings
set default_geofence_radius_m = greatest(1, least(default_geofence_radius_m, 25))
where default_geofence_radius_m is null
   or default_geofence_radius_m < 1
   or default_geofence_radius_m > 25;
