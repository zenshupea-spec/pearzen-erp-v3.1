-- H-12: FM holiday calendar persisted on md_settings.

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS holiday_calendar jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN md_settings.holiday_calendar IS
  'Poya, statutory, and public holiday dates for FM payroll day-type premiums.';
