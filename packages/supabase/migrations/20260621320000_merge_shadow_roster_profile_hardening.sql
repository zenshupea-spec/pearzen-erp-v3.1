-- Harden shadow roster merge: unique-slot dedup, EPF normalization, sm_guard_assignments carry-over.

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
  v_temp_id text := upper(trim(p_temp_emp_id));
  v_perm_epf text;
BEGIN
  IF v_temp_id = '' THEN
    RAISE EXCEPTION 'Temp guard id is required.';
  END IF;

  SELECT upper(trim(emp_number)) INTO v_perm_epf
  FROM employees
  WHERE id = p_perm_emp_id;

  IF v_perm_epf IS NULL OR v_perm_epf = '' THEN
    RAISE EXCEPTION 'Permanent employee not found.';
  END IF;

  -- Drop temp rows that would violate unique (sm_epf, shift_date, shift_type, guard_epf).
  DELETE FROM sm_guard_attendance AS t
  WHERE t.guard_epf = v_temp_id
    AND EXISTS (
      SELECT 1
      FROM sm_guard_attendance AS p
      WHERE p.guard_epf = v_perm_epf
        AND p.sm_epf = t.sm_epf
        AND p.shift_date = t.shift_date
        AND p.shift_type = t.shift_type
    );

  UPDATE sm_guard_attendance
  SET guard_epf = v_perm_epf
  WHERE guard_epf = v_temp_id;

  IF EXISTS (
    SELECT 1 FROM sm_guard_attendance WHERE guard_epf = v_temp_id
  ) THEN
    RAISE EXCEPTION 'Failed to reassign all temp attendance rows.';
  END IF;

  UPDATE sm_guard_assignments
  SET guard_epf = v_perm_epf
  WHERE guard_epf = v_temp_id
    AND NOT EXISTS (
      SELECT 1
      FROM sm_guard_assignments AS existing
      WHERE existing.sm_epf = sm_guard_assignments.sm_epf
        AND existing.guard_epf = v_perm_epf
    );

  DELETE FROM sm_guard_assignments
  WHERE guard_epf = v_temp_id;

  UPDATE shadow_roster_slots
  SET
    status = 'MERGED',
    merged_to_employee_id = p_perm_emp_id,
    active_to = COALESCE(active_to, CURRENT_DATE),
    updated_at = now()
  WHERE temp_id = v_temp_id
    AND status = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active shadow roster slot not found for temp id %.', v_temp_id;
  END IF;
END;
$$;
