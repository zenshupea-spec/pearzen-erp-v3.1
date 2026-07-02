-- WFM-only product bundle + per-tenant hub module gating (SaaS Forge D4)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'company_product_bundle') THEN
    CREATE TYPE public.company_product_bundle AS ENUM ('full_erp', 'wfm_only');
  END IF;
END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS product_bundle public.company_product_bundle NOT NULL DEFAULT 'full_erp';

COMMENT ON COLUMN public.companies.product_bundle IS
  'full_erp = standard HQ Master Hub; wfm_only = workforce tool subset (/wfm hub).';

ALTER TABLE public.md_settings
  ADD COLUMN IF NOT EXISTS enabled_modules jsonb;

COMMENT ON COLUMN public.md_settings.enabled_modules IS
  'Optional hub module route allowlist (e.g. ["/hr","/fm"]). Null = all modules for the product bundle.';

CREATE INDEX IF NOT EXISTS companies_product_bundle_idx
  ON public.companies (product_bundle);
