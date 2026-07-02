-- Pears super-app read-only export boundary — store profile snapshots + export jobs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'superapp_export_job_status') THEN
    CREATE TYPE public.superapp_export_job_status AS ENUM (
      'pending',
      'running',
      'completed',
      'failed'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.superapp_store_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  payload_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superapp_store_snapshots_company_idx
  ON public.superapp_store_snapshots (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.superapp_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'store_profile'
    CHECK (job_type IN ('store_profile')),
  status public.superapp_export_job_status NOT NULL DEFAULT 'pending',
  snapshot_id uuid REFERENCES public.superapp_store_snapshots(id) ON DELETE SET NULL,
  error_message text,
  requested_by text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superapp_export_jobs_company_idx
  ON public.superapp_export_jobs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS superapp_export_jobs_status_idx
  ON public.superapp_export_jobs (status, created_at DESC);

ALTER TABLE public.superapp_store_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superapp_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_superapp_store_snapshots
  ON public.superapp_store_snapshots FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_role_all_superapp_export_jobs
  ON public.superapp_export_jobs FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.superapp_store_snapshots IS
  'Immutable Pears store-profile export payloads — tenant ERP remains source of truth.';

COMMENT ON TABLE public.superapp_export_jobs IS
  'Forge / Pears API export job queue for super-app store profile snapshots.';
