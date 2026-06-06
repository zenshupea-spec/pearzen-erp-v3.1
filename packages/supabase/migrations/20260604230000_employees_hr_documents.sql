-- HR vetting / identity document scans (MNR drawer + onboarding)

alter table employees
  add column if not exists mod_clearance_url text,
  add column if not exists police_clearance_url text,
  add column if not exists grama_niladari_url text,
  add column if not exists birth_certificate_url text,
  add column if not exists servicemen_certificate_url text,
  add column if not exists nic_passport_doc_url text;

comment on column employees.mod_clearance_url is 'Scanned MoD clearance certificate';
comment on column employees.police_clearance_url is 'Scanned police clearance certificate';
comment on column employees.grama_niladari_url is 'Grama Niladari certificate scan';
comment on column employees.birth_certificate_url is 'Birth certificate scan';
comment on column employees.servicemen_certificate_url is 'Ex-servicemen certificate scan';
comment on column employees.nic_passport_doc_url is 'NIC or passport scan';

insert into storage.buckets (id, name, public)
values ('employee-hr-documents', 'employee-hr-documents', true)
on conflict (id) do update set public = true;
