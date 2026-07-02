-- SM PWA: guard consent selfie buckets (uniform issue + disciplinary penalty).

INSERT INTO storage.buckets (id, name, public)
VALUES ('uniform-consent-selfies', 'uniform-consent-selfies', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

INSERT INTO storage.buckets (id, name, public)
VALUES ('penalty-consent-selfies', 'penalty-consent-selfies', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS uniform_consent_selfies_sm_insert ON storage.objects;
CREATE POLICY uniform_consent_selfies_sm_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'uniform-consent-selfies'
    AND (storage.foldername(name))[1] = public.sm_portal_auth_epf()
  );

DROP POLICY IF EXISTS penalty_consent_selfies_sm_insert ON storage.objects;
CREATE POLICY penalty_consent_selfies_sm_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'penalty-consent-selfies'
    AND (storage.foldername(name))[1] = public.sm_portal_auth_epf()
  );

DROP POLICY IF EXISTS uniform_consent_selfies_service_role ON storage.objects;
CREATE POLICY uniform_consent_selfies_service_role
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'uniform-consent-selfies')
  WITH CHECK (bucket_id = 'uniform-consent-selfies');

DROP POLICY IF EXISTS penalty_consent_selfies_service_role ON storage.objects;
CREATE POLICY penalty_consent_selfies_service_role
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'penalty-consent-selfies')
  WITH CHECK (bucket_id = 'penalty-consent-selfies');
