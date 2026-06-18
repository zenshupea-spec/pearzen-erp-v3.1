-- Fleet telematics ingestion: raw pings, in-progress trips, last-known GPS on assets.

alter table fleet_assets
  add column if not exists last_latitude numeric,
  add column if not exists last_longitude numeric;

create table if not exists fleet_telematics_pings (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  asset_id        uuid not null references fleet_assets (id) on delete cascade,
  tag_id          text not null,
  latitude        numeric not null,
  longitude       numeric not null,
  speed_kmh       numeric not null default 0 check (speed_kmh >= 0),
  location_label  text not null default '',
  recorded_at     timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists fleet_telematics_pings_asset_time_idx
  on fleet_telematics_pings (asset_id, recorded_at desc);

create index if not exists fleet_telematics_pings_company_time_idx
  on fleet_telematics_pings (company_id, recorded_at desc);

create table if not exists fleet_active_trips (
  asset_id          uuid primary key references fleet_assets (id) on delete cascade,
  company_id        uuid not null,
  started_at        timestamptz not null,
  start_latitude    numeric not null,
  start_longitude   numeric not null,
  start_label       text not null default '',
  start_map_x       numeric not null,
  start_map_y       numeric not null,
  route_points      jsonb not null default '[]'::jsonb,
  distance_km       numeric not null default 0 check (distance_km >= 0),
  last_speed_kmh    numeric not null default 0,
  last_move_at      timestamptz not null,
  idle_since        timestamptz,
  updated_at        timestamptz not null default now()
);

create index if not exists fleet_active_trips_company_idx
  on fleet_active_trips (company_id);

alter table fleet_telematics_pings enable row level security;
alter table fleet_active_trips enable row level security;

create policy "service_role_all_fleet_telematics_pings"
  on fleet_telematics_pings for all
  using (auth.role() = 'service_role');

create policy "authenticated_read_fleet_telematics_pings"
  on fleet_telematics_pings for select to authenticated
  using (true);

create policy "authenticated_write_fleet_telematics_pings"
  on fleet_telematics_pings for all to authenticated
  using (true)
  with check (true);

create policy "service_role_all_fleet_active_trips"
  on fleet_active_trips for all
  using (auth.role() = 'service_role');

create policy "authenticated_read_fleet_active_trips"
  on fleet_active_trips for select to authenticated
  using (true);

create policy "authenticated_write_fleet_active_trips"
  on fleet_active_trips for all to authenticated
  using (true)
  with check (true);
