alter table employees
  add column if not exists debt_notes text;

comment on column employees.debt_notes is
  'FM payroll context from bulk roster import — legacy loan / recovery notes for instalment planning.';
