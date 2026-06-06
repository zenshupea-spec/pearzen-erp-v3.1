-- HR: maternity leave flag (excludes employee from inactive/no-shift bucket)
alter table employees
  add column if not exists maternity_leave boolean not null default false;
