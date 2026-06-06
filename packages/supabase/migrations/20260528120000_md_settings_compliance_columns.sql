-- Add statutory compliance fields to md_settings.
-- statutory_takehome_floor: minimum % of gross pay an employee must take home (FM payroll engine).
-- max_deduction_pct: maximum % of basic salary that can be deducted per month (OM recovery plan builder).

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS statutory_takehome_floor NUMERIC DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_deduction_pct NUMERIC DEFAULT 20;
