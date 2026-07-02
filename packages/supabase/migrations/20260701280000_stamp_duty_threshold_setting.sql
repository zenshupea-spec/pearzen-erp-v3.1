-- Configurable stamp-duty gross threshold in MD payroll statutory envelope.

UPDATE md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_payrollStatutory,stampDutyThresholdLkr}',
  '30000'::jsonb,
  true
)
WHERE jsonb_typeof(setting_value) = 'object';
