-- Per-booking caretaker collection amount (optional — blank = internal note only)
ALTER TABLE shalom_bookings
  ADD COLUMN IF NOT EXISTS caretaker_collect_lkr numeric(14, 2);

COMMENT ON COLUMN shalom_bookings.caretaker_collect_lkr IS
  'Amount caretaker should collect from guest; NULL = personnel use only, excluded from net profit';
