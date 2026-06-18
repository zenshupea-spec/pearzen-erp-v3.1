-- Public security company website content (read-only RPC for anonymous visitors).

CREATE OR REPLACE FUNCTION public.get_security_public_website(p_company_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT ms.setting_value->'_securityWebsite'
      FROM md_settings ms
      WHERE ms.company_id = p_company_id
      LIMIT 1
    ),
    '{}'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_security_public_website(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_security_public_website(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_security_public_website IS
  'Read-only marketing website payload for Pearzen Security public site. No payroll, guard, or client financial data.';
