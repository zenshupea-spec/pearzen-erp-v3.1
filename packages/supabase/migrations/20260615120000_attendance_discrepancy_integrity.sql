-- OM Integrity & Discrepancy queue — attendance log columns + recovery plans

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS guard_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_profile_id uuid REFERENCES site_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shift_date date,
  ADD COLUMN IF NOT EXISTS rostered_start timestamptz,
  ADD COLUMN IF NOT EXISTS biometric_check_in timestamptz,
  ADD COLUMN IF NOT EXISTS is_overlap_conflict boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_approved_time timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_method text;

CREATE INDEX IF NOT EXISTS attendance_logs_discrepancy_queue_idx
  ON attendance_logs (company_id, shift_date DESC)
  WHERE status = 'PENDING_RESOLUTION';

CREATE TABLE IF NOT EXISTS discrepancy_recovery_plans (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id    uuid NOT NULL REFERENCES attendance_logs(id) ON DELETE CASCADE,
  company_id           uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  guard_id             uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  deduction_method     text NOT NULL DEFAULT 'CUT_SHIFTS'
                         CHECK (deduction_method IN ('CUT_SHIFTS', 'MONTHLY')),
  recovery_amount_lkr  numeric(12,2) NOT NULL DEFAULT 0,
  months_to_recover    integer NOT NULL DEFAULT 1 CHECK (months_to_recover >= 1),
  shifts_per_month     integer NOT NULL DEFAULT 1 CHECK (shifts_per_month >= 0),
  per_shift_value_lkr  numeric(12,2) NOT NULL DEFAULT 0,
  guard_configs        jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes                text,
  status               text NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'COMPLETED', 'CANCELLED')),
  created_by           uuid NOT NULL,
  created_by_name      text NOT NULL DEFAULT '',
  updated_by           uuid,
  updated_by_name      text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE discrepancy_recovery_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_recovery_plans ON discrepancy_recovery_plans;
CREATE POLICY tenant_isolation_recovery_plans
  ON discrepancy_recovery_plans
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_recovery_plans_log
  ON discrepancy_recovery_plans (attendance_log_id);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_company
  ON discrepancy_recovery_plans (company_id);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_guard
  ON discrepancy_recovery_plans (guard_id);
CREATE INDEX IF NOT EXISTS idx_recovery_plans_status
  ON discrepancy_recovery_plans (attendance_log_id, status);
