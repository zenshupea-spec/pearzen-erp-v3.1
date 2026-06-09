-- Bank export, APIT/stamp duty (payroll statutory extras), and pay formula strings.

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS bank_export_settings jsonb,
  ADD COLUMN IF NOT EXISTS pay_formulas jsonb;

COMMENT ON COLUMN md_settings.bank_export_settings IS
  'Master payroll bank file format, global enforce toggle, and external-bank batch split.';
COMMENT ON COLUMN md_settings.pay_formulas IS
  'Guard and café day-type pay formula strings for the payroll engine.';
