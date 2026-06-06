-- Courier uniform requests (OM/TM/SM) — HQ dispatch queue and DISPATCHED status

alter table sm_uniform_requests
  drop constraint if exists sm_uniform_requests_status_check;

alter table sm_uniform_requests
  add constraint sm_uniform_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'ISSUED', 'REJECTED', 'DISPATCHED'));

alter table sm_uniform_requests
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatched_by uuid,
  add column if not exists courier_dispatch_notes text;

create index if not exists sm_uniform_requests_courier_pending_idx
  on sm_uniform_requests (request_type, status, created_at desc)
  where request_type = 'REQUEST_REPLACEMENT';

comment on column sm_uniform_requests.courier_dispatch_notes is 'HQ notes when marking courier request as dispatched';
