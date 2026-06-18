-- Advance salary caps on existing advance_salary_settings jsonb

UPDATE md_settings
SET advance_salary_settings = COALESCE(advance_salary_settings, '{}'::jsonb)
  || '{"guardMaxAdvanceLkr":60000,"otherEmployeeMaxAdvanceLkr":100000}'::jsonb
WHERE advance_salary_settings IS NULL
   OR advance_salary_settings->>'guardMaxAdvanceLkr' IS NULL
   OR advance_salary_settings->>'otherEmployeeMaxAdvanceLkr' IS NULL;

ALTER TABLE md_settings
  ALTER COLUMN advance_salary_settings SET DEFAULT '{"guardMinShifts":12,"guardMaxAdvanceLkr":60000,"otherEmployeeMaxAdvanceLkr":100000}'::jsonb;
