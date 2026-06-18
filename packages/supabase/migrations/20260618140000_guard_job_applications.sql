-- Public security careers applications → OM applicants desk.

CREATE TABLE IF NOT EXISTS public.guard_job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_profile_id uuid REFERENCES public.site_profiles(id) ON DELETE SET NULL,
  site_label text NOT NULL,
  phone_primary text NOT NULL,
  phone_secondary text,
  weight_kg numeric(5, 2) NOT NULL CHECK (weight_kg > 0),
  height_ft numeric(4, 2) NOT NULL CHECK (height_ft > 0),
  id_doc_front_url text NOT NULL,
  id_doc_back_url text,
  servicemen_cert_url text NOT NULL,
  selfie_url text NOT NULL,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'reviewed', 'contacted', 'hired', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS guard_job_applications_company_created_idx
  ON public.guard_job_applications (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guard_job_applications_site_idx
  ON public.guard_job_applications (site_profile_id, created_at DESC)
  WHERE site_profile_id IS NOT NULL;

ALTER TABLE public.guard_job_applications ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('guard-job-applications', 'guard-job-applications', true)
ON CONFLICT (id) DO UPDATE SET public = true;

COMMENT ON TABLE public.guard_job_applications IS
  'Public careers applications from security website — reviewed in OM portal.';
