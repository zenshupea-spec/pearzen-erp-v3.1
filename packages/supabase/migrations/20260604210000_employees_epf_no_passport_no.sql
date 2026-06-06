-- MNR personal fields used by HR drawer + offboarding clearance
alter table employees
  add column if not exists epf_no text,
  add column if not exists passport_no text;

comment on column employees.epf_no is 'EPF membership number (distinct from internal emp_number)';
comment on column employees.passport_no is 'Passport number for expat / travel records';

-- Backfill from legacy seed column if present
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'epf_num'
  ) then
    update employees
    set epf_no = epf_num::text
    where epf_no is null
      and epf_num is not null;
  end if;
end $$;
