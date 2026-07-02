-- R-ADV-01: Advance salary caps column + CVS persisted settings.

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS advance_salary_settings jsonb
  DEFAULT '{"guardMinShifts":12,"guardMaxAdvanceLkr":60000,"otherEmployeeMaxAdvanceLkr":100000}'::jsonb;

UPDATE md_settings
SET advance_salary_settings = jsonb_build_object(
  'guardMinShifts', 20,
  'guardMaxAdvanceLkr', 10000,
  'otherEmployeeMaxAdvanceLkr', 30000
)
WHERE company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid;
