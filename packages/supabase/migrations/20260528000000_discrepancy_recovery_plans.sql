-- ==========================================
-- DISCREPANCY RECOVERY PLANS
-- Tracks financial recovery plans attached to
-- attendance discrepancy logs. Supports two
-- deduction methods: CUT_SHIFTS and MONTHLY.
-- Multi-guard split via guard_configs JSONB.
-- Full edit history is preserved.
-- ==========================================

CREATE TABLE discrepancy_recovery_plans (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id    UUID        NOT NULL,
  company_id           UUID        NOT NULL,
  guard_id             UUID        NOT NULL,  -- primary guard

  -- Deduction method
  deduction_method     TEXT        NOT NULL DEFAULT 'CUT_SHIFTS'
                         CHECK (deduction_method IN ('CUT_SHIFTS', 'MONTHLY')),

  -- Financial details
  recovery_amount_lkr  NUMERIC(12,2) NOT NULL DEFAULT 0,
  months_to_recover    INTEGER       NOT NULL DEFAULT 1 CHECK (months_to_recover >= 1),

  -- CUT_SHIFTS specific (global value per shift, shared across all guards)
  shifts_per_month     INTEGER       NOT NULL DEFAULT 1 CHECK (shifts_per_month >= 0),
  per_shift_value_lkr  NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Multi-guard split config
  -- Array of: { guard_id, guard_name, rank_enum, percentage, shifts_per_month }
  guard_configs        JSONB         NOT NULL DEFAULT '[]'::jsonb,

  notes                TEXT,

  -- Lifecycle: only one ACTIVE per attendance_log_id; older ones become SUPERSEDED
  status               TEXT        NOT NULL DEFAULT 'ACTIVE'
                         CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'COMPLETED', 'CANCELLED')),

  -- Audit trail — store name strings so history is readable even if user is deleted
  created_by           UUID        NOT NULL,
  created_by_name      TEXT        NOT NULL DEFAULT '',
  updated_by           UUID,
  updated_by_name      TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE discrepancy_recovery_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_recovery_plans"
ON discrepancy_recovery_plans FOR ALL
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Indexes
CREATE INDEX idx_recovery_plans_log     ON discrepancy_recovery_plans(attendance_log_id);
CREATE INDEX idx_recovery_plans_company ON discrepancy_recovery_plans(company_id);
CREATE INDEX idx_recovery_plans_guard   ON discrepancy_recovery_plans(guard_id);
CREATE INDEX idx_recovery_plans_status  ON discrepancy_recovery_plans(attendance_log_id, status);

-- Auto-update updated_at
CREATE TRIGGER set_timestamp_recovery_plans
BEFORE UPDATE ON discrepancy_recovery_plans
FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();
