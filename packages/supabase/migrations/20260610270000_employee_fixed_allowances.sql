-- Fixed monthly allowances on MNR (site / meal / transport)

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS site_allowance_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance_lkr numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN employees.site_allowance_lkr IS 'Fixed monthly site allowance from MNR — rolls into FM payroll and payslip';
COMMENT ON COLUMN employees.meal_allowance_lkr IS 'Fixed monthly meal allowance from MNR';
COMMENT ON COLUMN employees.transport_allowance_lkr IS 'Fixed monthly transport allowance from MNR';

-- Per-payroll-month variable earnings adjusted by FM (arrears, performance incentive)

CREATE TABLE IF NOT EXISTS fm_payroll_earnings_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  period_year int NOT NULL CHECK (period_year >= 2000 AND period_year <= 2100),
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  arrears_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  performance_incentive_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS fm_payroll_earnings_adjustments_lookup_idx
  ON fm_payroll_earnings_adjustments (company_id, period_year, period_month, employee_id);

COMMENT ON TABLE fm_payroll_earnings_adjustments IS
  'FM-entered variable payroll earnings per employee and month (arrears, performance incentive).';

ALTER TABLE fm_payroll_earnings_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_fm_payroll_earnings_adjustments
    ON fm_payroll_earnings_adjustments FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
