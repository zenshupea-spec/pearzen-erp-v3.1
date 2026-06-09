-- Café front: one check-in per day, optional check-out after operating hours.

ALTER TABLE cafe_staff_checkins
  ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_latitude numeric(10, 6),
  ADD COLUMN IF NOT EXISTS checkout_longitude numeric(10, 6),
  ADD COLUMN IF NOT EXISTS checkout_selfie_url text;

ALTER TABLE cafe_staff_checkins
  DROP CONSTRAINT IF EXISTS cafe_staff_checkins_employee_id_checkin_date_shift_type_key;

-- One check-in row per employee per day (regardless of shift_type label).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cafe_staff_checkins_one_per_day
  ON cafe_staff_checkins (employee_id, checkin_date);
