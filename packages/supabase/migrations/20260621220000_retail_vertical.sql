-- Retail / e-commerce vertical tables (SaaS Forge D6 template).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retail_cart_status') THEN
    CREATE TYPE public.retail_cart_status AS ENUM ('open', 'checked_out', 'abandoned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retail_order_status') THEN
    CREATE TYPE public.retail_order_status AS ENUM ('pending', 'paid', 'fulfilled', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'retail_payment_method') THEN
    CREATE TYPE public.retail_payment_method AS ENUM ('cash', 'card', 'transfer');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.retail_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  unit_price_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price_lkr >= 0),
  is_active boolean NOT NULL DEFAULT true,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retail_products_company_idx
  ON public.retail_products (company_id, is_active, published);

CREATE TABLE IF NOT EXISTS public.retail_stock_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.retail_products(id) ON DELETE CASCADE,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id)
);

CREATE INDEX IF NOT EXISTS retail_stock_levels_company_idx
  ON public.retail_stock_levels (company_id, product_id);

CREATE TABLE IF NOT EXISTS public.retail_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cart_code text NOT NULL,
  status public.retail_cart_status NOT NULL DEFAULT 'open',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, cart_code)
);

CREATE INDEX IF NOT EXISTS retail_carts_company_status_idx
  ON public.retail_carts (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.retail_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cart_id uuid REFERENCES public.retail_carts(id) ON DELETE SET NULL,
  order_number text NOT NULL,
  status public.retail_order_status NOT NULL DEFAULT 'pending',
  total_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total_lkr >= 0),
  payment_method public.retail_payment_method NOT NULL DEFAULT 'cash',
  customer_name text,
  customer_phone text,
  notes text,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, order_number)
);

CREATE INDEX IF NOT EXISTS retail_orders_company_created_idx
  ON public.retail_orders (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.retail_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.retail_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.retail_products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price_lkr >= 0),
  line_total_lkr numeric(12, 2) NOT NULL DEFAULT 0 CHECK (line_total_lkr >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retail_order_lines_order_idx
  ON public.retail_order_lines (order_id);

COMMENT ON TABLE public.retail_products IS 'Retail vertical — sellable product catalog per tenant.';
COMMENT ON TABLE public.retail_stock_levels IS 'Retail vertical — on-hand stock per product.';
COMMENT ON TABLE public.retail_carts IS 'Retail vertical — in-progress counter carts.';
COMMENT ON TABLE public.retail_orders IS 'Retail vertical — completed checkout orders.';
COMMENT ON TABLE public.retail_order_lines IS 'Retail vertical — order line items.';

ALTER TABLE public.retail_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retail_order_lines ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.retail_tenant_company_ids()
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

GRANT EXECUTE ON FUNCTION public.retail_tenant_company_ids() TO authenticated;

DO $policy$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'retail_products',
    'retail_stock_levels',
    'retail_carts',
    'retail_orders',
    'retail_order_lines'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_all_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY service_role_all_%I ON public.%I FOR ALL USING (auth.role() = ''service_role'')',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_select_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_select_%I ON public.%I FOR SELECT TO authenticated USING (company_id IN (SELECT public.retail_tenant_company_ids()))',
      tbl, tbl
    );

    EXECUTE format('DROP POLICY IF EXISTS tenant_write_%I ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY tenant_write_%I ON public.%I FOR ALL TO authenticated USING (company_id IN (SELECT public.retail_tenant_company_ids())) WITH CHECK (company_id IN (SELECT public.retail_tenant_company_ids()))',
      tbl, tbl
    );
  END LOOP;
END
$policy$;
