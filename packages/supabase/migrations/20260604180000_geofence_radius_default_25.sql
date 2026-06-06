-- MD-owned check-in radius; company default is 25 m (OM does not override on GPS capture).

alter table site_profiles
  alter column geofence_radius set default 25;
