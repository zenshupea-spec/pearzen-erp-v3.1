-- Partner-assisted client setup: custom domains, PayHere credentials, operator assist grants.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_custom_domain_type') THEN
    CREATE TYPE public.tenant_custom_domain_type AS ENUM (
      'erp_staff',
      'public_website',
      'customer_menu',
      'security_website'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_domain_ssl_status') THEN
    CREATE TYPE public.tenant_domain_ssl_status AS ENUM ('pending', 'active', 'error');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_custom_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  domain_type public.tenant_custom_domain_type NOT NULL DEFAULT 'public_website',
  verified_at timestamptz,
  ssl_status public.tenant_domain_ssl_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, hostname)
);

CREATE INDEX IF NOT EXISTS tenant_custom_domains_company_idx
  ON public.tenant_custom_domains (company_id, domain_type);

COMMENT ON TABLE public.tenant_custom_domains IS
  'Per-tenant custom hostnames — middleware wiring ships in Tier 3 (D1).';

CREATE TABLE IF NOT EXISTS public.tenant_payhere_credentials (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  merchant_id text NOT NULL,
  merchant_secret_encrypted text NOT NULL,
  sandbox boolean NOT NULL DEFAULT true,
  configured_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_partner_id uuid REFERENCES public.forge_service_partners(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tenant_payhere_credentials IS
  'Per-tenant PayHere merchant credentials — secret encrypted at rest; never returned to browsers.';

CREATE TABLE IF NOT EXISTS public.forge_partner_assist_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.forge_service_partners(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  domain_setup boolean NOT NULL DEFAULT false,
  payhere_setup boolean NOT NULL DEFAULT false,
  granted_by text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, company_id)
);

CREATE INDEX IF NOT EXISTS forge_partner_assist_grants_partner_idx
  ON public.forge_partner_assist_grants (partner_id, company_id);

COMMENT ON TABLE public.forge_partner_assist_grants IS
  'Forge-operator toggles allowing partners to assist linked tenants with domains or PayHere setup.';

ALTER TABLE public.tenant_custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_payhere_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_partner_assist_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_tenant_custom_domains ON public.tenant_custom_domains;
DROP POLICY IF EXISTS partner_read_tenant_custom_domains ON public.tenant_custom_domains;
DROP POLICY IF EXISTS partner_write_tenant_custom_domains ON public.tenant_custom_domains;
DROP POLICY IF EXISTS service_role_tenant_payhere ON public.tenant_payhere_credentials;
DROP POLICY IF EXISTS service_role_assist_grants ON public.forge_partner_assist_grants;
DROP POLICY IF EXISTS partner_read_assist_grants ON public.forge_partner_assist_grants;

CREATE POLICY service_role_tenant_custom_domains
  ON public.tenant_custom_domains FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY partner_read_tenant_custom_domains
  ON public.tenant_custom_domains FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT fp.company_id
      FROM public.forge_partner_portfolios fp
      INNER JOIN public.forge_service_partners p ON p.id = fp.partner_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY partner_write_tenant_custom_domains
  ON public.tenant_custom_domains FOR ALL
  TO authenticated
  USING (
    company_id IN (
      SELECT g.company_id
      FROM public.forge_partner_assist_grants g
      INNER JOIN public.forge_service_partners p ON p.id = g.partner_id
      INNER JOIN public.forge_partner_portfolios fp
        ON fp.partner_id = g.partner_id AND fp.company_id = g.company_id
      WHERE p.user_id = auth.uid()
        AND g.domain_setup = true
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT g.company_id
      FROM public.forge_partner_assist_grants g
      INNER JOIN public.forge_service_partners p ON p.id = g.partner_id
      INNER JOIN public.forge_partner_portfolios fp
        ON fp.partner_id = g.partner_id AND fp.company_id = g.company_id
      WHERE p.user_id = auth.uid()
        AND g.domain_setup = true
        AND (g.expires_at IS NULL OR g.expires_at > now())
    )
  );

CREATE POLICY service_role_tenant_payhere
  ON public.tenant_payhere_credentials FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_role_assist_grants
  ON public.forge_partner_assist_grants FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY partner_read_assist_grants
  ON public.forge_partner_assist_grants FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  );
