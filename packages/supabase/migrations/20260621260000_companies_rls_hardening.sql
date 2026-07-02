-- F1: Replace open authenticated read on companies with tenant-scoped policies.
-- Drops legacy "Allow authenticated read" (USING true) when present.
-- Keeps partner_read_portfolio_companies from 20260621160000_partner_portfolio_policies.sql.

CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(current_setting('app.company_id', true)), '')::uuid,
    (
      SELECT e.company_id
      FROM public.employees e
      WHERE e.company_id IS NOT NULL
        AND lower(trim(e.email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      ORDER BY e.created_at ASC NULLS LAST
      LIMIT 1
    ),
    (
      SELECT p.company_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id IS NOT NULL
      LIMIT 1
    )
  );
$$;

COMMENT ON FUNCTION public.get_current_user_company_id() IS
  'Tenant scope for RLS: app.company_id session, employee email match, then profiles.';

GRANT EXECUTE ON FUNCTION public.get_current_user_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_company_id() TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read" ON public.companies;
DROP POLICY IF EXISTS "Users can view their own company" ON public.companies;
DROP POLICY IF EXISTS tenant_read_own_company ON public.companies;
DROP POLICY IF EXISTS service_role_all_companies ON public.companies;

CREATE POLICY service_role_all_companies
  ON public.companies
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY tenant_read_own_company
  ON public.companies
  FOR SELECT
  TO authenticated
  USING (id = public.get_current_user_company_id());
