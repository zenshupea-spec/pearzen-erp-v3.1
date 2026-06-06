-- HR requests FM offboarding settlement before resignation can be confirmed
alter table employees
  add column if not exists hr_offboarding_sent_to_fm_at timestamptz,
  add column if not exists hr_offboarding_sent_to_fm_by uuid references auth.users (id);

comment on column employees.hr_offboarding_sent_to_fm_at is
  'HR sent this employee to FM offboarding settlement queue';
comment on column employees.hr_offboarding_sent_to_fm_by is
  'Auth user id of HR who sent employee to FM offboarding queue';
