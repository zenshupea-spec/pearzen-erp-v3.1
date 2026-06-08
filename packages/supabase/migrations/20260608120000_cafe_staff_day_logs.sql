-- Daily café attendance + OT with manual-edit audit trail

CREATE TABLE IF NOT EXISTS cafe_staff_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  worked boolean NOT NULL DEFAULT false,
  ot_hours numeric(5,2) NOT NULL DEFAULT 0,
  ot_lkr numeric(12,2) NOT NULL DEFAULT 0,
  edited_at timestamptz,
  edited_by_name text,
  edited_by_email text,
  prev_worked boolean,
  prev_ot_hours numeric(5,2),
  prev_ot_lkr numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_cafe_staff_day_logs_company_month
  ON cafe_staff_day_logs (company_id, work_date);

ALTER TABLE cafe_staff_day_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_staff_day_logs
    ON cafe_staff_day_logs FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
