-- Café roster rows keyed by MD Settings internal branch id (loc_*), not site_profiles UUID.

CREATE TABLE IF NOT EXISTS cafe_rostered_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  branch_id text NOT NULL,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift_type text NOT NULL CHECK (shift_type IN ('MORNING', 'EVENING', 'DAY')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, branch_id, employee_id, shift_date)
);

CREATE INDEX IF NOT EXISTS idx_cafe_rostered_shifts_branch_date
  ON cafe_rostered_shifts (company_id, branch_id, shift_date);

ALTER TABLE cafe_rostered_shifts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_rostered_shifts
    ON cafe_rostered_shifts FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
