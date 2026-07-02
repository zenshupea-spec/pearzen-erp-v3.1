-- Per-tenant vertical add-on subscriptions (salon, restaurant/café, retail).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_vertical_key') THEN
    CREATE TYPE public.tenant_vertical_key AS ENUM ('restaurant', 'salon', 'retail');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_vertical_status') THEN
    CREATE TYPE public.tenant_vertical_status AS ENUM ('inactive', 'active', 'suspended');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenant_vertical_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vertical public.tenant_vertical_key NOT NULL,
  status public.tenant_vertical_status NOT NULL DEFAULT 'inactive',
  started_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, vertical)
);

CREATE INDEX IF NOT EXISTS tenant_vertical_subscriptions_company_idx
  ON public.tenant_vertical_subscriptions (company_id, vertical);

CREATE INDEX IF NOT EXISTS tenant_vertical_subscriptions_status_idx
  ON public.tenant_vertical_subscriptions (vertical, status);

ALTER TABLE public.tenant_vertical_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_tenant_vertical_subscriptions
  ON public.tenant_vertical_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY tenant_read_own_vertical_subscriptions
  ON public.tenant_vertical_subscriptions FOR SELECT
  TO authenticated
  USING (
    company_id IN (
      SELECT e.company_id
      FROM public.employees e
      WHERE lower(e.email) = lower((auth.jwt() ->> 'email'))
    )
  );

COMMENT ON TABLE public.tenant_vertical_subscriptions IS
  'Forge-provisioned vertical modules per tenant — salon, restaurant/café, retail.';

-- Backfill restaurant vertical from legacy has_cafe_module flag.
INSERT INTO public.tenant_vertical_subscriptions (company_id, vertical, status, started_at)
SELECT c.id, 'restaurant'::public.tenant_vertical_key, 'active'::public.tenant_vertical_status, now()
FROM public.companies c
WHERE COALESCE(c.has_cafe_module, false) = true
ON CONFLICT (company_id, vertical) DO UPDATE
SET
  status = 'active'::public.tenant_vertical_status,
  started_at = COALESCE(public.tenant_vertical_subscriptions.started_at, EXCLUDED.started_at),
  updated_at = now();

-- Keep has_cafe_module aligned when restaurant vertical is active.
CREATE OR REPLACE FUNCTION public.sync_company_cafe_module_from_restaurant_vertical()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.vertical = 'restaurant'::public.tenant_vertical_key THEN
    UPDATE public.companies
    SET has_cafe_module = (NEW.status = 'active'::public.tenant_vertical_status)
    WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenant_vertical_subscriptions_sync_cafe_module
  ON public.tenant_vertical_subscriptions;

CREATE TRIGGER tenant_vertical_subscriptions_sync_cafe_module
  AFTER INSERT OR UPDATE OF status, vertical ON public.tenant_vertical_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_company_cafe_module_from_restaurant_vertical();

-- Reverse sync when has_cafe_module toggled directly.
CREATE OR REPLACE FUNCTION public.sync_restaurant_vertical_from_cafe_module()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.has_cafe_module IS DISTINCT FROM OLD.has_cafe_module THEN
    INSERT INTO public.tenant_vertical_subscriptions (company_id, vertical, status, started_at)
    VALUES (
      NEW.id,
      'restaurant'::public.tenant_vertical_key,
      CASE
        WHEN COALESCE(NEW.has_cafe_module, false) THEN 'active'::public.tenant_vertical_status
        ELSE 'inactive'::public.tenant_vertical_status
      END,
      CASE WHEN COALESCE(NEW.has_cafe_module, false) THEN now() ELSE NULL END
    )
    ON CONFLICT (company_id, vertical) DO UPDATE
    SET
      status = CASE
        WHEN COALESCE(NEW.has_cafe_module, false) THEN 'active'::public.tenant_vertical_status
        ELSE 'inactive'::public.tenant_vertical_status
      END,
      started_at = CASE
        WHEN COALESCE(NEW.has_cafe_module, false)
          THEN COALESCE(public.tenant_vertical_subscriptions.started_at, now())
        ELSE public.tenant_vertical_subscriptions.started_at
      END,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_sync_restaurant_vertical ON public.companies;

CREATE TRIGGER companies_sync_restaurant_vertical
  AFTER UPDATE OF has_cafe_module ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_restaurant_vertical_from_cafe_module();
