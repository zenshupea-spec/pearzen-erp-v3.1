-- Tenant public websites (website building product) — published content per company + site type.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_public_site_type') THEN
    CREATE TYPE public.tenant_public_site_type AS ENUM (
      'security_marketing',
      'landing',
      'menu'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_public_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_type public.tenant_public_site_type NOT NULL,
  hostname text,
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, site_type)
);

CREATE INDEX IF NOT EXISTS tenant_public_sites_company_idx
  ON public.tenant_public_sites (company_id, site_type);

COMMENT ON TABLE public.tenant_public_sites IS
  'Published tenant marketing sites — security, landing pages, and menu link cards.';

ALTER TABLE public.tenant_public_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_tenant_public_sites ON public.tenant_public_sites;
DROP POLICY IF EXISTS tenant_md_read_public_sites ON public.tenant_public_sites;
DROP POLICY IF EXISTS tenant_md_write_public_sites ON public.tenant_public_sites;

CREATE POLICY service_role_tenant_public_sites
  ON public.tenant_public_sites FOR ALL
  USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.get_tenant_public_website(
  p_company_id uuid,
  p_site_type text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(t.content_json, '{}'::jsonb)
  FROM public.tenant_public_sites t
  WHERE t.company_id = p_company_id
    AND t.site_type::text = p_site_type
    AND t.published_at IS NOT NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_public_website(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_public_website(uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_tenant_public_website IS
  'Anonymous read of published tenant public website JSON by company and site type.';
