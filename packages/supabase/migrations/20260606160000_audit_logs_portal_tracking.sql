-- Staff portal audit trail: portal context + actor metadata on audit_logs
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS portal text,
  ADD COLUMN IF NOT EXISTS target_entity text,
  ADD COLUMN IF NOT EXISTS actor_role text,
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS audit_logs_portal_created_idx
  ON public.audit_logs (company_id, portal, created_at DESC);

-- Allow tenant staff to read executive audit entries (MD/OD tab)
DO $$ BEGIN
  CREATE POLICY tenant_read_executive_audit_logs
    ON executive_audit_logs FOR SELECT
    USING (company_id = public.get_current_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY tenant_insert_executive_audit_logs
    ON executive_audit_logs FOR INSERT
    WITH CHECK (company_id = public.get_current_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
