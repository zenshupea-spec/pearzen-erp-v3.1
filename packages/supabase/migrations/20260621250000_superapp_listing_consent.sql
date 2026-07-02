-- Pears super-app listing consent — tenant MD opt-in for marketplace exposure.

CREATE TABLE IF NOT EXISTS public.superapp_listing_consent (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  consented_at timestamptz,
  list_products boolean NOT NULL DEFAULT false,
  list_booking boolean NOT NULL DEFAULT false,
  consented_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS superapp_listing_consent_consented_idx
  ON public.superapp_listing_consent (consented_at DESC NULLS LAST)
  WHERE consented_at IS NOT NULL;

COMMENT ON TABLE public.superapp_listing_consent IS
  'Tenant MD opt-in for Pears marketplace listings — products and booking visibility.';

ALTER TABLE public.superapp_listing_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_superapp_listing_consent
  ON public.superapp_listing_consent FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY tenant_md_read_superapp_listing_consent
  ON public.superapp_listing_consent FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT e.company_id
      FROM public.employees e
      WHERE lower(e.email) = lower((auth.jwt() ->> 'email'))
        AND upper(trim(coalesce(e.rank, ''))) = 'MD'
    )
  );

CREATE POLICY tenant_md_write_superapp_listing_consent
  ON public.superapp_listing_consent FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT e.company_id
      FROM public.employees e
      WHERE lower(e.email) = lower((auth.jwt() ->> 'email'))
        AND upper(trim(coalesce(e.rank, ''))) = 'MD'
    )
  );

CREATE POLICY tenant_md_update_superapp_listing_consent
  ON public.superapp_listing_consent FOR UPDATE
  TO authenticated
  USING (
    company_id IN (
      SELECT e.company_id
      FROM public.employees e
      WHERE lower(e.email) = lower((auth.jwt() ->> 'email'))
        AND upper(trim(coalesce(e.rank, ''))) = 'MD'
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT e.company_id
      FROM public.employees e
      WHERE lower(e.email) = lower((auth.jwt() ->> 'email'))
        AND upper(trim(coalesce(e.rank, ''))) = 'MD'
    )
  );
