-- Align guard Saturday pay formula across md_settings.pay_formulas (CVS statutory formula).
-- Preview @ B=30,000 → LKR 1,990.38 per Saturday shift.

UPDATE md_settings
SET pay_formulas = jsonb_set(
  COALESCE(pay_formulas, '{}'::jsonb),
  '{guard,saturdayHalfDay}',
  to_jsonb('((B/26) * (6/8)) + ((B/200) * 1.5 * 5)'::text),
  true
)
WHERE pay_formulas IS NOT NULL
   OR company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e';

-- Ensure CVS anchor row carries full default guard formula set when column was null.
UPDATE md_settings
SET pay_formulas = jsonb_build_object(
  'guard', jsonb_build_object(
    'standardWorkingDay', '(B/26) + ((B/200) * 1.5 * 3)',
    'otRatePerHour', '(B/200) * 1.5',
    'poyaDay', '(B/200) * (2 * 11)',
    'publicHoliday', '(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)',
    'statutory', '(B/26) + ((B/26) * (14/12) * (1/26)) + ((B/200) * 1.5 * 3)',
    'weeklyHolidaySunday', '(B/200) * 1.5 * 11',
    'saturdayHalfDay', '((B/26) * (6/8)) + ((B/200) * 1.5 * 5)'
  ),
  'cafe', COALESCE(pay_formulas->'cafe', '{}'::jsonb)
)
WHERE company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'
  AND pay_formulas IS NULL;
