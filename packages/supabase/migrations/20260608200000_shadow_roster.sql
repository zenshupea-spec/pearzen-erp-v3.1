-- Shadow roster: temp guard slots for HR reconciliation (merge → MNR)

CREATE TABLE IF NOT EXISTS shadow_roster_slots (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  temp_id                 text NOT NULL,
  sequence_num            int NOT NULL,
  sm_epf                  text NOT NULL,
  field_identity          text NOT NULL DEFAULT '—',
  status                  text NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE', 'ARCHIVED', 'MERGED')),
  active_from             date NOT NULL DEFAULT CURRENT_DATE,
  active_to               date,
  archived_at             timestamptz,
  merged_to_employee_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, temp_id),
  UNIQUE (company_id, sequence_num)
);

CREATE INDEX IF NOT EXISTS shadow_roster_slots_company_status_idx
  ON shadow_roster_slots (company_id, status);

CREATE INDEX IF NOT EXISTS shadow_roster_slots_sm_epf_idx
  ON shadow_roster_slots (sm_epf, status);

CREATE INDEX IF NOT EXISTS idx_sm_guard_attendance_guard_epf
  ON sm_guard_attendance (guard_epf);

ALTER TABLE shadow_roster_slots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_shadow_roster_slots
    ON shadow_roster_slots FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY authenticated_read_shadow_roster_slots
    ON shadow_roster_slots FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY authenticated_write_shadow_roster_slots
    ON shadow_roster_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Merge temp attendance into permanent employee profile
CREATE OR REPLACE FUNCTION merge_shadow_roster_profile(
  p_temp_emp_id text,
  p_perm_emp_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perm_epf text;
BEGIN
  SELECT emp_number INTO v_perm_epf
  FROM employees
  WHERE id = p_perm_emp_id;

  IF v_perm_epf IS NULL THEN
    RAISE EXCEPTION 'Permanent employee not found.';
  END IF;

  UPDATE sm_guard_attendance
  SET guard_epf = v_perm_epf
  WHERE guard_epf = p_temp_emp_id;

  UPDATE shadow_roster_slots
  SET
    status = 'MERGED',
    merged_to_employee_id = p_perm_emp_id,
    active_to = COALESCE(active_to, CURRENT_DATE),
    updated_at = now()
  WHERE temp_id = p_temp_emp_id
    AND status = 'ACTIVE';
END;
$$;
