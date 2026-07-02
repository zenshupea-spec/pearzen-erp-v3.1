-- Salon vertical add-on tables (SaaS Forge D5 template).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salon_appointment_status') THEN
    CREATE TYPE public.salon_appointment_status AS ENUM (
      'scheduled',
      'completed',
      'cancelled',
      'no_show'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'salon_payment_method') THEN
    CREATE TYPE public.salon_payment_method AS ENUM ('cash', 'card', 'transfer');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.salon_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  price_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (price_lkr >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salon_services_company_idx
  ON public.salon_services (company_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.salon_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  unit_price_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price_lkr >= 0),
  stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS salon_products_company_idx
  ON public.salon_products (company_id, is_active);

CREATE TABLE IF NOT EXISTS public.salon_inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.salon_products(id) ON DELETE CASCADE,
  lot_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id, lot_code)
);

CREATE INDEX IF NOT EXISTS salon_inventory_lots_company_idx
  ON public.salon_inventory_lots (company_id, product_id);

CREATE TABLE IF NOT EXISTS public.salon_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.salon_services(id) ON DELETE SET NULL,
  client_name text NOT NULL,
  client_phone text,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  status public.salon_appointment_status NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start)
);

CREATE INDEX IF NOT EXISTS salon_appointments_company_start_idx
  ON public.salon_appointments (company_id, scheduled_start DESC);

CREATE TABLE IF NOT EXISTS public.salon_pos_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  receipt_number text NOT NULL,
  total_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_lkr >= 0),
  payment_method public.salon_payment_method NOT NULL DEFAULT 'cash',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, receipt_number)
);

CREATE INDEX IF NOT EXISTS salon_pos_transactions_company_idx
  ON public.salon_pos_transactions (company_id, created_at DESC);

COMMENT ON TABLE public.salon_services IS 'Salon vertical — bookable services per tenant.';
COMMENT ON TABLE public.salon_products IS 'Salon vertical — retail product catalog per tenant.';
COMMENT ON TABLE public.salon_inventory_lots IS 'Salon vertical — product lot tracking.';
COMMENT ON TABLE public.salon_appointments IS 'Salon vertical — client appointment schedule.';
COMMENT ON TABLE public.salon_pos_transactions IS 'Salon vertical — POS receipt ledger.';

-- RLS: service_role ALL + tenant staff read/write via employee email company match.
ALTER TABLE public.salon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_pos_transactions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.salon_tenant_company_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.company_id
  FROM public.employees e
  WHERE e.company_id IS NOT NULL
    AND lower(e.email) = lower((auth.jwt() ->> 'email'));
$$;

GRANT EXECUTE ON FUNCTION public.salon_tenant_company_ids() TO authenticated;

DO $policy$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'salon_services',
    'salon_products',
    'salon_inventory_lots',
    'salon_appointments',
    'salon_pos_transactions'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON public.%I FOR ALL USING (auth.role() = ''service_role'')',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT TO authenticated USING (company_id IN (SELECT public.salon_tenant_company_ids()))',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_write_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_write_%I ON public.%I FOR ALL TO authenticated USING (company_id IN (SELECT public.salon_tenant_company_ids())) WITH CHECK (company_id IN (SELECT public.salon_tenant_company_ids()))',
      tbl, tbl
    );
  END LOOP;
END
$policy$;
