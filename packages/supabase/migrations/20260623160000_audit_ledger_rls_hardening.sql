-- R-AUDIT-01: Tenant-scoped SELECT on audit ledgers for governance roles.

DROP POLICY IF EXISTS "Tenant isolation for audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS tenant_read_audit_logs ON public.audit_logs;

CREATE POLICY tenant_read_audit_logs
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

DROP POLICY IF EXISTS tenant_read_executive_audit_logs ON public.executive_audit_logs;

CREATE POLICY tenant_read_executive_audit_logs
  ON public.executive_audit_logs
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));
