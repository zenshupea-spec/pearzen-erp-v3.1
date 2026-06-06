-- Guard check-in configuration on site_profiles (ISO 18788 verification modes)

alter table site_profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists geofence_radius integer not null default 100,
  add column if not exists verification_mode text not null default 'B'
    check (verification_mode in ('A', 'B', 'C')),
  add column if not exists nfc_tag_id text;
