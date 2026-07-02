-- R-STORAGE-01: private verification photo buckets + guard/SM upload policies.

INSERT INTO storage.buckets (id, name, public)
VALUES ('attendance_selfies', 'attendance_selfies', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sm-visit-selfies', 'sm-visit-selfies', false)
ON CONFLICT (id) DO UPDATE SET public = false;

UPDATE storage.buckets
SET public = false
WHERE id IN ('attendance_selfies', 'sm-visit-selfies');

DROP POLICY IF EXISTS attendance_selfies_guard_insert ON storage.objects;
CREATE POLICY attendance_selfies_guard_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'attendance_selfies'
    AND lower(name) LIKE lower(public.guard_portal_auth_local()) || '%'
  );

DROP POLICY IF EXISTS sm_visit_selfies_sm_insert ON storage.objects;
CREATE POLICY sm_visit_selfies_sm_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sm-visit-selfies'
    AND (storage.foldername(name))[1] = public.sm_portal_auth_epf()
  );
