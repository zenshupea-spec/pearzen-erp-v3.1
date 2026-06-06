-- FM confirms final offboarding payment (net salary after recoveries) before HR marks resigned
alter table employees
  add column if not exists fm_offboarding_payment_confirmed_at timestamptz,
  add column if not exists fm_offboarding_payment_confirmed_by uuid references auth.users (id);

comment on column employees.fm_offboarding_payment_confirmed_at is
  'FM confirmed final net offboarding payment released to employee';
comment on column employees.fm_offboarding_payment_confirmed_by is
  'Auth user id of FM who confirmed offboarding payment';
