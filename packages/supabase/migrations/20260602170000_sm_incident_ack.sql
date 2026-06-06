-- Tri-role acknowledgement for SM incident command queue (OM / SM / MD)

alter table sm_incident_reports
  add column if not exists ack_om boolean not null default false,
  add column if not exists ack_sm boolean not null default false,
  add column if not exists ack_md boolean not null default false;
