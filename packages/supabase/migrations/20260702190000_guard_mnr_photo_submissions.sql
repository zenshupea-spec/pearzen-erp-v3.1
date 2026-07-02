-- SM-submitted guard MNR reference photos — TM approval queue before HR master photo.

CREATE TABLE IF NOT EXISTS public.guard_mnr_photo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  guard_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  guard_epf text NOT NULL,
  guard_name text,
  guard_site text,
  sm_epf text NOT NULL,
  sm_name text,
  photo_url text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'RESUBMIT_REQUESTED')),
  reviewed_by_email text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guard_mnr_photo_submissions_company_status_idx
  ON public.guard_mnr_photo_submissions (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS guard_mnr_photo_submissions_guard_idx
  ON public.guard_mnr_photo_submissions (guard_employee_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS guard_mnr_photo_submissions_guard_active_uidx
  ON public.guard_mnr_photo_submissions (guard_employee_id)
  WHERE status IN ('PENDING', 'RESUBMIT_REQUESTED');

COMMENT ON TABLE public.guard_mnr_photo_submissions IS
  'SM-captured guard MNR reference photos pending TM approval before employees.id_photo_url is set.';

ALTER TABLE public.guard_mnr_photo_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guard_mnr_photo_submissions_service_role ON public.guard_mnr_photo_submissions;
CREATE POLICY guard_mnr_photo_submissions_service_role
  ON public.guard_mnr_photo_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('guard-mnr-photo-submissions', 'guard-mnr-photo-submissions', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS guard_mnr_photo_submissions_storage_service ON storage.objects;
CREATE POLICY guard_mnr_photo_submissions_storage_service
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'guard-mnr-photo-submissions')
  WITH CHECK (bucket_id = 'guard-mnr-photo-submissions');
