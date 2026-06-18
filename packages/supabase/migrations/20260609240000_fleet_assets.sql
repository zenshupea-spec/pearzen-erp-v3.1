-- Executive Fleet & Assets: registered GPS tags, telematics snapshots, flagged trips, route history.

create table if not exists fleet_assets (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null,
  name                text not null,
  plate               text not null,
  driver_name         text not null default '',
  vehicle_type        text not null default 'Sedan',
  fuel_type           text not null default 'Petrol'
                      check (fuel_type in ('Petrol', 'Diesel', 'Electric', 'Hybrid')),
  tracker_type        text not null default 'Hardwired GPS (Teltonika/SinoTrack)',
  tag_id              text not null,
  marker_color        text not null default 'amber'
                      check (marker_color in ('amber', 'sky', 'emerald', 'violet')),
  status              text not null default 'PARKED'
                      check (status in ('ONLINE', 'PARKED', 'IDLE')),
  speed_kmh           numeric not null default 0 check (speed_kmh >= 0),
  location_label      text not null default '',
  last_ping_at        timestamptz,
  map_x               numeric not null default 400 check (map_x >= 0 and map_x <= 800),
  map_y               numeric not null default 210 check (map_y >= 0 and map_y <= 420),
  efficiency_km_l     numeric not null default 10 check (efficiency_km_l > 0),
  gps_km_mtd          numeric not null default 0 check (gps_km_mtd >= 0),
  allowance_liters    numeric not null default 0 check (allowance_liters >= 0),
  allowance_lkr       numeric not null default 0 check (allowance_lkr >= 0),
  fuel_period_year    integer not null default extract(year from current_date)::integer,
  fuel_period_month   integer not null default extract(month from current_date)::integer
                      check (fuel_period_month between 1 and 12),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists fleet_assets_company_plate_uidx
  on fleet_assets (company_id, lower(plate))
  where is_active = true;

create unique index if not exists fleet_assets_company_tag_uidx
  on fleet_assets (company_id, lower(tag_id))
  where is_active = true;

create index if not exists fleet_assets_company_active_idx
  on fleet_assets (company_id, is_active, updated_at desc);

create table if not exists fleet_flagged_trips (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  asset_id          uuid not null references fleet_assets (id) on delete cascade,
  vehicle_name      text not null default '',
  driver_name       text not null default '',
  from_label        text not null default '',
  to_label          text not null default '',
  trip_date         date not null,
  actual_mins       integer not null check (actual_mins >= 0),
  expected_mins     integer not null check (expected_mins > 0),
  avg_speed_kmh     numeric not null check (avg_speed_kmh >= 0),
  speed_limit_kmh   numeric not null check (speed_limit_kmh > 0),
  severity          text not null
                    check (severity in ('RECKLESS', 'SPEEDING', 'AGGRESSIVE')),
  route_path        text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists fleet_flagged_trips_company_date_idx
  on fleet_flagged_trips (company_id, trip_date desc);

create index if not exists fleet_flagged_trips_asset_idx
  on fleet_flagged_trips (asset_id, trip_date desc);

create table if not exists fleet_route_history (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  asset_id    uuid not null references fleet_assets (id) on delete cascade,
  trip_date   date not null,
  label       text not null default '',
  route_path  text not null default '',
  is_flagged  boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists fleet_route_history_asset_date_idx
  on fleet_route_history (asset_id, trip_date desc);

create index if not exists fleet_route_history_company_date_idx
  on fleet_route_history (company_id, trip_date desc);

alter table fleet_assets enable row level security;
alter table fleet_flagged_trips enable row level security;
alter table fleet_route_history enable row level security;

create policy "service_role_all_fleet_assets"
  on fleet_assets for all
  using (auth.role() = 'service_role');

create policy "authenticated_read_fleet_assets"
  on fleet_assets for select to authenticated
  using (true);

create policy "authenticated_write_fleet_assets"
  on fleet_assets for all to authenticated
  using (true)
  with check (true);

create policy "service_role_all_fleet_flagged_trips"
  on fleet_flagged_trips for all
  using (auth.role() = 'service_role');

create policy "authenticated_read_fleet_flagged_trips"
  on fleet_flagged_trips for select to authenticated
  using (true);

create policy "authenticated_write_fleet_flagged_trips"
  on fleet_flagged_trips for all to authenticated
  using (true)
  with check (true);

create policy "service_role_all_fleet_route_history"
  on fleet_route_history for all
  using (auth.role() = 'service_role');

create policy "authenticated_read_fleet_route_history"
  on fleet_route_history for select to authenticated
  using (true);

create policy "authenticated_write_fleet_route_history"
  on fleet_route_history for all to authenticated
  using (true)
  with check (true);
