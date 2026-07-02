-- R-SM-05: Maps/route km on SM trips + CVS May 2026 fuel surplus test fixture.

alter table sm_visit_logs
  add column if not exists route_km numeric(8, 2);

comment on column sm_visit_logs.route_km is
  'Google Maps / route engine verified distance (km) — compared to km_claimed for fuel surplus clawback';

insert into sm_visit_logs (
  company_id,
  sm_epf,
  visit_type,
  site_name,
  notes,
  km_claimed,
  route_km,
  verification_status,
  visit_date
)
select
  '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid,
  '144',
  'INCIDENT_TRIP',
  'test site — test',
  'R-SM-05 fuel surplus fixture',
  100,
  60,
  'FLAGGED',
  '2026-05-15'::date
where not exists (
  select 1
  from sm_visit_logs
  where company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
    and notes = 'R-SM-05 fuel surplus fixture'
);
