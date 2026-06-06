-- Master Site Directory (MD/FM): contract, billing, and margin fields on site_profiles.
-- Also catches up columns referenced by OM/SM portals when not yet applied remotely.

alter table site_profiles
  add column if not exists required_guards integer not null default 1
    check (required_guards >= 0),
  add column if not exists geofence_radius integer not null default 25,
  add column if not exists verification_mode text not null default 'B'
    check (verification_mode in ('A', 'B', 'C')),
  add column if not exists nfc_tag_id text,
  add column if not exists needs_om_gps_capture boolean not null default false,
  add column if not exists location_captured_at timestamptz,
  add column if not exists location_captured_by text,
  add column if not exists site_code text,
  add column if not exists client_name text,
  add column if not exists parent_client text,
  add column if not exists client_billing_address text,
  add column if not exists contract_start date,
  add column if not exists contract_end date,
  add column if not exists per_visit_charge_lkr numeric not null default 0,
  add column if not exists min_dwell_time_minutes integer not null default 0,
  add column if not exists site_status text not null default 'PENDING'
    check (site_status in ('ACTIVE', 'SUSPENDED', 'PENDING')),
  add column if not exists rate_matrix jsonb not null default '{}'::jsonb,
  add column if not exists rate_audit jsonb;

create index if not exists idx_site_profiles_parent_client
  on site_profiles (parent_client)
  where parent_client is not null;

create index if not exists idx_site_profiles_client_name
  on site_profiles (client_name)
  where client_name is not null;
