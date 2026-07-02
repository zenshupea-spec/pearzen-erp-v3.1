-- R-CAF-06: roll up day-log OT onto cafe_staff_periods for hub KPI / FM readers
ALTER TABLE cafe_staff_periods
  ADD COLUMN IF NOT EXISTS ot_total_hours numeric(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_total_lkr numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN cafe_staff_periods.ot_total_hours IS 'Sum of cafe_staff_day_logs.ot_hours for period_month (syncStaffPeriodFromDayLogs).';
COMMENT ON COLUMN cafe_staff_periods.ot_total_lkr IS 'Sum of cafe_staff_day_logs.ot_lkr for period_month (syncStaffPeriodFromDayLogs).';
