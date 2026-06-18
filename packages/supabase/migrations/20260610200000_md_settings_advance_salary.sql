-- Advance salary eligibility: minimum guard shifts per salary month

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS advance_salary_settings jsonb DEFAULT '{"guardMinShifts":12,"guardMaxAdvanceLkr":60000,"otherEmployeeMaxAdvanceLkr":100000}'::jsonb;
