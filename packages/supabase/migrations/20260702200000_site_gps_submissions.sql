-- SM-submitted site GPS coordinates — TM approval queue before site_profiles is updated.

CREATE TABLE IF NOT EXISTS public.site_gps_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_profile_id uuid NOT NULL REFERENCES public.site_profiles(id) ON DELETE CASCADE,
  site_name text NOT NULL,
  sm_epf text NOT NULL,
  sm_name text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy_m double precision,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'RESUBMIT_REQUESTED')),
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_gps_submissions_company_status_idx
  ON public.site_gps_submissions (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS site_gps_submissions_site_idx
  ON public.site_gps_submissions (site_profile_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS site_gps_submissions_site_active_uidx
  ON public.site_gps_submissions (site_profile_id)
  WHERE status IN ('PENDING', 'RESUBMIT_REQUESTED');

COMMENT ON TABLE public.site_gps_submissions IS
  'SM field GPS submissions pending TM approval before site_profiles coordinates are set.';

ALTER TABLE public.site_gps_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_gps_submissions_service_role ON public.site_gps_submissions;
CREATE POLICY site_gps_submissions_service_role
  ON public.site_gps_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
