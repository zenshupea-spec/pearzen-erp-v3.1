-- Sites are archived (not deleted) from the Master Site Directory.

alter table site_profiles drop constraint if exists site_profiles_site_status_check;

alter table site_profiles
  add constraint site_profiles_site_status_check
  check (site_status in ('ACTIVE', 'SUSPENDED', 'PENDING', 'ARCHIVED'));
