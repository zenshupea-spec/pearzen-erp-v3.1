-- HR internal memo per employee — editable in MNR drawer and bulk roster web editor.

alter table employees
  add column if not exists hr_memo text;

comment on column employees.hr_memo is
  'HR internal memo — editable in MNR and bulk roster editor; not shown on payslips or field portals.';
