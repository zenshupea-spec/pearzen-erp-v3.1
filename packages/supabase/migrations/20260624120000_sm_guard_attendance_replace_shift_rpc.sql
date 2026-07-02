-- H-8: Atomic replace for SM guard roster (delete + insert in one transaction).

CREATE OR REPLACE FUNCTION replace_sm_guard_attendance_shift(
  p_sm_epf text,
  p_shift_date date,
  p_shift_type text,
  p_status text,
  p_entries jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_shift_type NOT IN ('DAY', 'NIGHT') THEN
    RAISE EXCEPTION 'Invalid shift_type: %', p_shift_type;
  END IF;

  IF p_status NOT IN ('SUBMITTED', 'CONFIRMED') THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  DELETE FROM sm_guard_attendance
  WHERE sm_epf = p_sm_epf
    AND shift_date = p_shift_date
    AND shift_type = p_shift_type;

  IF p_entries IS NULL OR jsonb_array_length(p_entries) = 0 THEN
    RETURN;
  END IF;

  INSERT INTO sm_guard_attendance (sm_epf, shift_date, shift_type, site_name, guard_epf, status)
  SELECT
    p_sm_epf,
    p_shift_date,
    p_shift_type,
    trim(entry->>'site_name'),
    upper(trim(entry->>'guard_epf')),
    p_status
  FROM jsonb_array_elements(p_entries) AS entry
  WHERE coalesce(trim(entry->>'site_name'), '') <> ''
    AND coalesce(trim(entry->>'guard_epf'), '') <> '';
END;
$$;

REVOKE ALL ON FUNCTION replace_sm_guard_attendance_shift(text, date, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION replace_sm_guard_attendance_shift(text, date, text, text, jsonb) TO service_role;
