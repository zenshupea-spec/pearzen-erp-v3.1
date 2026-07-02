-- Platform operator audit trail for Forge control-plane actions (S-31).

CREATE TABLE IF NOT EXISTS public.forge_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL,
  action_type text NOT NULL,
  target_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_audit_log_created_idx
  ON public.forge_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS forge_audit_log_target_company_idx
  ON public.forge_audit_log (target_company_id, created_at DESC);

ALTER TABLE public.forge_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_forge_audit_log ON public.forge_audit_log;

CREATE POLICY service_role_all_forge_audit_log
  ON public.forge_audit_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.forge_audit_log IS
  'SaaS Forge platform operator audit — tenant provisioning, billing overrides, etc.';
