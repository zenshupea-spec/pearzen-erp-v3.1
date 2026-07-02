-- MNR monthly pay components (SL payroll: basic + fixed/special allowances + fixed deduction)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS fixed_allowance_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS special_allowance_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_deduction_lkr numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.fixed_allowance_lkr IS 'Fixed monthly allowance from MNR — rolls into FM payroll gross';
COMMENT ON COLUMN employees.special_allowance_lkr IS 'Special / COL allowance from MNR — rolls into FM payroll gross';
COMMENT ON COLUMN employees.fixed_deduction_lkr IS 'Fixed monthly deduction from MNR — applied each FM payroll month';
