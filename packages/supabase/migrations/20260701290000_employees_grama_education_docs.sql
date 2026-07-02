-- MNR ISO vetting: Grama Niladari expiry + O/L education certificate scan

alter table employees
  add column if not exists grama_niladari_expiry date,
  add column if not exists education_certificate_ol_url text;

comment on column employees.grama_niladari_expiry is 'Grama Niladari certificate expiry — required when scan is on file';
comment on column employees.education_certificate_ol_url is 'O/L education certificate scan';
