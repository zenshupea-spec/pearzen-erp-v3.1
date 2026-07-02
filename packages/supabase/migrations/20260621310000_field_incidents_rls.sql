-- G3: Field PWA guard incidents — company_id tenant scope + drop open RLS bypasses.

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.incidents i
SET company_id = (
  SELECT e.company_id
  FROM public.employees e
  WHERE e.company_id IS NOT NULL
    AND (
      upper(trim(e.emp_number)) = upper(trim(i.emp_number))
      OR upper(trim(coalesce(e.epf_no, ''))) = upper(trim(i.emp_number))
      OR upper(trim(coalesce(e.epf_num::text, ''))) = upper(trim(i.emp_number))
    )
  ORDER BY e.created_at ASC NULLS LAST
  LIMIT 1
)
WHERE i.company_id IS NULL;

UPDATE public.incidents
SET company_id = '29fbb2ff-6aa6-46c4-8b2d-d19eebb2874e'::uuid
WHERE company_id IS NULL;

ALTER TABLE public.incidents
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS incidents_company_created_idx
  ON public.incidents (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.guard_portal_auth_local()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1)));
$$;

GRANT EXECUTE ON FUNCTION public.guard_portal_auth_local() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_portal_auth_local() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_employee_company_id_for_auth()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.company_id
  FROM public.employees e
  WHERE e.company_id IS NOT NULL
    AND (
      lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      OR upper(trim(e.emp_number)) = upper(public.guard_portal_auth_local())
      OR upper(trim(coalesce(e.epf_no, ''))) = upper(public.guard_portal_auth_local())
      OR upper(trim(coalesce(e.epf_num::text, ''))) = upper(public.guard_portal_auth_local())
    )
  ORDER BY e.created_at ASC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.guard_employee_company_id_for_auth() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_employee_company_id_for_auth() TO service_role;

CREATE OR REPLACE FUNCTION public.guard_portal_writable_emp_numbers()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT upper(trim(emp_key))
  FROM (
    SELECT upper(public.guard_portal_auth_local()) AS emp_key
    UNION ALL
    SELECT upper(trim(e.emp_number))
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND (
        lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        OR upper(trim(e.emp_number)) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_no, ''))) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_num::text, ''))) = upper(public.guard_portal_auth_local())
      )
    UNION ALL
    SELECT upper(trim(coalesce(e.epf_no, '')))
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND (
        lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        OR upper(trim(e.emp_number)) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_no, ''))) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_num::text, ''))) = upper(public.guard_portal_auth_local())
      )
    UNION ALL
    SELECT upper(trim(coalesce(e.epf_num::text, '')))
    FROM public.employees e
    WHERE e.company_id IS NOT NULL
      AND (
        lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
        OR upper(trim(e.emp_number)) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_no, ''))) = upper(public.guard_portal_auth_local())
        OR upper(trim(coalesce(e.epf_num::text, ''))) = upper(public.guard_portal_auth_local())
      )
  ) keys
  WHERE emp_key IS NOT NULL AND emp_key <> '';
$$;

GRANT EXECUTE ON FUNCTION public.guard_portal_writable_emp_numbers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_portal_writable_emp_numbers() TO service_role;

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read incidents" ON public.incidents;
DROP POLICY IF EXISTS "Guards can insert incidents" ON public.incidents;
DROP POLICY IF EXISTS service_role_incidents ON public.incidents;
DROP POLICY IF EXISTS tenant_select_incidents ON public.incidents;
DROP POLICY IF EXISTS tenant_write_incidents ON public.incidents;
DROP POLICY IF EXISTS guard_portal_read_incidents ON public.incidents;
DROP POLICY IF EXISTS guard_portal_insert_incidents ON public.incidents;

CREATE POLICY service_role_incidents
  ON public.incidents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tenant_select_incidents
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY tenant_write_incidents
  ON public.incidents
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

CREATE POLICY guard_portal_read_incidents
  ON public.incidents
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.guard_employee_company_id_for_auth()
    AND upper(trim(emp_number)) IN (SELECT public.guard_portal_writable_emp_numbers())
  );

CREATE POLICY guard_portal_insert_incidents
  ON public.incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = public.guard_employee_company_id_for_auth()
    AND upper(trim(emp_number)) IN (SELECT public.guard_portal_writable_emp_numbers())
  );
