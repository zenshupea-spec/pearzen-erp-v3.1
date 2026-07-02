-- G2: SM visit logs + incident reports — company_id tenant scope + SM portal RLS.

ALTER TABLE public.sm_visit_logs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.sm_incident_reports
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.sm_visit_logs v
SET company_id = COALESCE(
  (
    SELECT e.company_id
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND (
        upper(trim(e.emp_number)) = upper(trim(v.sm_epf))
        OR upper(trim(coalesce(e.epf_no, ''))) = upper(trim(v.sm_epf))
      )
    ORDER BY e.created_at ASC NULLS LAST
    LIMIT 1
  ),
  (
    SELECT sp.company_id
    FROM public.site_profiles sp
    WHERE sp.site_name = v.site_name
      AND sp.company_id IS NOT NULL
    LIMIT 1
  )
)
WHERE v.company_id IS NULL;

UPDATE public.sm_incident_reports r
SET company_id = COALESCE(
  (
    SELECT e.company_id
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND (
        upper(trim(e.emp_number)) = upper(trim(r.sm_epf))
        OR upper(trim(coalesce(e.epf_no, ''))) = upper(trim(r.sm_epf))
      )
    ORDER BY e.created_at ASC NULLS LAST
    LIMIT 1
  ),
  (
    SELECT sp.company_id
    FROM public.site_profiles sp
    WHERE sp.site_name = r.site_name
      AND sp.company_id IS NOT NULL
    LIMIT 1
  )
)
WHERE r.company_id IS NULL;

UPDATE public.sm_visit_logs
SET company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
WHERE company_id IS NULL;

UPDATE public.sm_incident_reports
SET company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
WHERE company_id IS NULL;

ALTER TABLE public.sm_visit_logs
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE public.sm_incident_reports
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS sm_visit_logs_company_created_idx
  ON public.sm_visit_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sm_incident_reports_company_created_idx
  ON public.sm_incident_reports (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sm_portal_auth_epf()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT upper(trim(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)));
$$;

COMMENT ON FUNCTION public.sm_portal_auth_epf() IS
  'SM portal login EPF prefix from Supabase Auth JWT email.';

GRANT EXECUTE ON FUNCTION public.sm_portal_auth_epf() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sm_portal_auth_epf() TO service_role;

CREATE OR REPLACE FUNCTION public.sm_employee_company_id_for_auth()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.company_id
  FROM public.employees e
  WHERE e.company_id IS NOT NULL
    AND e.group = 'SECTOR_MANAGER'
    AND (
      upper(trim(e.emp_number)) = public.sm_portal_auth_epf()
      OR upper(trim(coalesce(e.epf_no, ''))) = public.sm_portal_auth_epf()
      OR lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
    )
  ORDER BY e.created_at ASC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.sm_employee_company_id_for_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sm_employee_company_id_for_auth() TO service_role;

CREATE OR REPLACE FUNCTION public.sm_portal_writable_epfs()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT upper(trim(epf_key))
  FROM (
    SELECT public.sm_portal_auth_epf() AS epf_key
    UNION ALL
    SELECT e.emp_number
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND e.group = 'SECTOR_MANAGER'
      AND (
        upper(trim(e.emp_number)) = public.sm_portal_auth_epf()
        OR upper(trim(coalesce(e.epf_no, ''))) = public.sm_portal_auth_epf()
        OR lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
    UNION ALL
    SELECT e.epf_no
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND e.group = 'SECTOR_MANAGER'
      AND (
        upper(trim(e.emp_number)) = public.sm_portal_auth_epf()
        OR upper(trim(coalesce(e.epf_no, ''))) = public.sm_portal_auth_epf()
        OR lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      )
  ) keys
  WHERE epf_key IS NOT NULL AND epf_key <> '';
$$;

GRANT EXECUTE ON FUNCTION public.sm_portal_writable_epfs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sm_portal_writable_epfs() TO service_role;

ALTER TABLE public.sm_visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sm_incident_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_sm_visit_logs" ON public.sm_visit_logs;
DROP POLICY IF EXISTS service_role_all_sm_visit_logs ON public.sm_visit_logs;
DROP POLICY IF EXISTS tenant_select_sm_visit_logs ON public.sm_visit_logs;
DROP POLICY IF EXISTS tenant_write_sm_visit_logs ON public.sm_visit_logs;
DROP POLICY IF EXISTS sm_portal_read_sm_visit_logs ON public.sm_visit_logs;
DROP POLICY IF EXISTS sm_portal_insert_sm_visit_logs ON public.sm_visit_logs;

CREATE POLICY service_role_all_sm_visit_logs
  ON public.sm_visit_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tenant_select_sm_visit_logs
  ON public.sm_visit_logs
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY tenant_write_sm_visit_logs
  ON public.sm_visit_logs
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY sm_portal_read_sm_visit_logs
  ON public.sm_visit_logs
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.sm_employee_company_id_for_auth()
    AND upper(trim(sm_epf)) IN (SELECT public.sm_portal_writable_epfs())
  );

CREATE POLICY sm_portal_insert_sm_visit_logs
  ON public.sm_visit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.sm_employee_company_id_for_auth()
    AND upper(trim(sm_epf)) IN (SELECT public.sm_portal_writable_epfs())
  );

DROP POLICY IF EXISTS "service_role_all_sm_incidents" ON public.sm_incident_reports;
DROP POLICY IF EXISTS service_role_all_sm_incidents ON public.sm_incident_reports;
DROP POLICY IF EXISTS tenant_select_sm_incident_reports ON public.sm_incident_reports;
DROP POLICY IF EXISTS tenant_write_sm_incident_reports ON public.sm_incident_reports;
DROP POLICY IF EXISTS sm_portal_read_sm_incident_reports ON public.sm_incident_reports;
DROP POLICY IF EXISTS sm_portal_insert_sm_incident_reports ON public.sm_incident_reports;

CREATE POLICY service_role_all_sm_incidents
  ON public.sm_incident_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tenant_select_sm_incident_reports
  ON public.sm_incident_reports
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY tenant_write_sm_incident_reports
  ON public.sm_incident_reports
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY sm_portal_read_sm_incident_reports
  ON public.sm_incident_reports
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.sm_employee_company_id_for_auth()
    AND (
      upper(trim(sm_epf)) IN (SELECT public.sm_portal_writable_epfs())
      OR site_name IN (
        SELECT sp.site_name
        FROM public.site_profiles sp
        WHERE sp.company_id = public.sm_employee_company_id_for_auth()
          AND upper(trim(coalesce(sp.assigned_sm_epf, ''))) IN (
            SELECT public.sm_portal_writable_epfs()
          )
      )
    )
  );

CREATE POLICY sm_portal_insert_sm_incident_reports
  ON public.sm_incident_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.sm_employee_company_id_for_auth()
    AND upper(trim(sm_epf)) IN (SELECT public.sm_portal_writable_epfs())
  );
