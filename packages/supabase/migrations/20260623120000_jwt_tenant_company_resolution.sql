-- R-JWT-01: JWT tenant scope — app_metadata.company_id + portal synthetic emails in RLS.

CREATE OR REPLACE FUNCTION public.tenant_company_ids_for_auth_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cid
  FROM (
    SELECT NULLIF(trim(current_setting('app.company_id', true)), '')::uuid AS cid
    UNION ALL
    SELECT NULLIF(trim(auth.jwt() -> 'app_metadata' ->> 'company_id'), '')::uuid
    UNION ALL
    SELECT NULLIF(trim(auth.jwt() ->> 'company_id'), '')::uuid
    UNION ALL
    SELECT e.company_id
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND lower(trim(coalesce(e.email, ''))) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND coalesce(auth.jwt() ->> 'email', '') <> ''
    UNION ALL
    SELECT e.company_id
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND coalesce(auth.jwt() ->> 'email', '') ~ '@pearzen\.(local|sm|cafe)$'
      AND upper(trim(split_part(auth.jwt() ->> 'email', '@', 1))) IN (
        upper(trim(coalesce(e.emp_number, ''))),
        upper(trim(coalesce(e.epf_no, '')))
      )
      AND upper(trim(split_part(auth.jwt() ->> 'email', '@', 1))) <> ''
    UNION ALL
    SELECT p.company_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.company_id IS NOT NULL
  ) scoped
  WHERE cid IS NOT NULL;
$$;

COMMENT ON FUNCTION public.tenant_company_ids_for_auth_user() IS
  'Company IDs for RLS — app_metadata.company_id, work email, @pearzen.local|sm|cafe roster keys, profiles.';

-- Legacy JWT company_id policies → tenant baseline helpers
DROP POLICY IF EXISTS "tenant_isolation_time_shifts" ON public.time_shifts;
DROP POLICY IF EXISTS "tenant_isolation_time_rosters" ON public.time_rosters;
DROP POLICY IF EXISTS tenant_select_time_shifts ON public.time_shifts;
DROP POLICY IF EXISTS tenant_write_time_shifts ON public.time_shifts;
DROP POLICY IF EXISTS tenant_select_time_rosters ON public.time_rosters;
DROP POLICY IF EXISTS tenant_write_time_rosters ON public.time_rosters;

DO $time_engine_rls$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'time_shifts') THEN
    EXECUTE 'CREATE POLICY tenant_select_time_shifts ON public.time_shifts FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
    EXECUTE 'CREATE POLICY tenant_write_time_shifts ON public.time_shifts FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'time_rosters') THEN
    EXECUTE 'CREATE POLICY tenant_select_time_rosters ON public.time_rosters FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
    EXECUTE 'CREATE POLICY tenant_write_time_rosters ON public.time_rosters FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
  END IF;
END
$time_engine_rls$;

DROP POLICY IF EXISTS "tenant_isolation_recovery_plans" ON public.discrepancy_recovery_plans;
DROP POLICY IF EXISTS tenant_select_discrepancy_recovery_plans ON public.discrepancy_recovery_plans;
DROP POLICY IF EXISTS tenant_write_discrepancy_recovery_plans ON public.discrepancy_recovery_plans;

DO $recovery_rls$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'discrepancy_recovery_plans') THEN
    EXECUTE 'CREATE POLICY tenant_select_discrepancy_recovery_plans ON public.discrepancy_recovery_plans FOR SELECT TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
    EXECUTE 'CREATE POLICY tenant_write_discrepancy_recovery_plans ON public.discrepancy_recovery_plans FOR ALL TO authenticated USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user())) WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))';
  END IF;
END
$recovery_rls$;
