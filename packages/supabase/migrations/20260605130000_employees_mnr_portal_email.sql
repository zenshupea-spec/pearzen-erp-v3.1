-- MNR portal access: HR saves work email on the employee record; rank drives portal routing.

alter table employees
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists "group" text,
  add column if not exists site text;

comment on column employees.email is
  'Work / Google login email — matched to Supabase Auth on sign-in for portal access';
comment on column employees.role is 'Optional job title label (portal access uses rank)';
comment on column employees."group" is 'Corporate group: GUARD, SECTOR_MANAGER, HEAD_OFFICE, CAFE';

create unique index if not exists employees_email_lower_unique
  on employees (lower(trim(email)))
  where email is not null and trim(email) <> '';
