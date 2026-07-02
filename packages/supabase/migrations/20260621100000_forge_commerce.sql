-- SaaS Forge commerce — product catalog, purchases, and invoices (separate from ERP subscription billing).

CREATE TABLE IF NOT EXISTS public.forge_product_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  billing_model text NOT NULL CHECK (billing_model IN ('one_time', 'monthly', 'milestone')),
  base_price_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forge_product_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.forge_product_catalog(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  partner_id uuid,
  buyer_name text NOT NULL,
  buyer_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'completed')),
  price_lkr numeric(12, 2) NOT NULL,
  billing_interval text CHECK (billing_interval IN ('once', 'monthly', 'yearly')),
  started_at timestamptz,
  contact_thread_id uuid REFERENCES public.forge_contact_threads(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forge_product_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.forge_product_purchases(id) ON DELETE CASCADE,
  invoice_month date,
  due_date date NOT NULL,
  amount_lkr numeric(12, 2) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'unpaid', 'paid', 'void')),
  sent_at timestamptz,
  paid_at timestamptz,
  resend_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_product_purchases_product_idx
  ON public.forge_product_purchases (product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS forge_product_purchases_company_idx
  ON public.forge_product_purchases (company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS forge_product_invoices_purchase_idx
  ON public.forge_product_invoices (purchase_id, due_date DESC);

CREATE INDEX IF NOT EXISTS forge_product_invoices_status_idx
  ON public.forge_product_invoices (status, due_date DESC);

ALTER TABLE public.forge_product_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_product_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_product_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_forge_product_catalog
  ON public.forge_product_catalog FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_role_all_forge_product_purchases
  ON public.forge_product_purchases FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_role_all_forge_product_invoices
  ON public.forge_product_invoices FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.forge_product_catalog IS
  'Sellable Pearzen products — WFM, custom software, website builds, vertical add-ons. Managed in SaaS Forge.';

COMMENT ON TABLE public.forge_product_purchases IS
  'Standalone product sales distinct from per-tenant ERP subscription billing.';

COMMENT ON TABLE public.forge_product_invoices IS
  'Purchase invoices for Forge commerce — auto-sent via Resend from SaaS Forge.';

INSERT INTO public.forge_product_catalog (code, name, description, billing_model, base_price_lkr, metadata)
VALUES
  (
    'wfm_tool',
    'WFM Workforce & Hospitality Tool',
    'Payroll, GPS-verified attendance, rostering, and café/hospitality operations — sold separately from full ERP.',
    'monthly',
    15000,
    '{"category": "product", "pearzen_website_stat": "WFM"}'::jsonb
  ),
  (
    'custom_software',
    'Custom Internal Software',
    'Bespoke ERP modules, portals, and integrations scoped to client workflows — milestone or retainer billing.',
    'milestone',
    0,
    '{"category": "product", "pearzen_website_stat": "Custom"}'::jsonb
  ),
  (
    'website_build',
    'Website Building & Hosting',
    'Client marketing sites, security company websites, and customer-menu domains — setup plus optional monthly hosting.',
    'one_time',
    25000,
    '{"category": "product", "includes_hosting": true}'::jsonb
  ),
  (
    'vertical_salon',
    'Salon Vertical Add-on',
    'Booking scheduler and product POS for salon tenants.',
    'monthly',
    5000,
    '{"category": "vertical", "vertical": "salon"}'::jsonb
  ),
  (
    'vertical_restaurant',
    'Restaurant / Café Vertical Add-on',
    'Tableside ordering, dynamic menus, and in-house billing for F&B operators.',
    'monthly',
    8000,
    '{"category": "vertical", "vertical": "restaurant"}'::jsonb
  ),
  (
    'vertical_retail',
    'Retail / E-commerce Vertical Add-on',
    'Inventory controls, checkout carts, and physical product selling.',
    'monthly',
    8000,
    '{"category": "vertical", "vertical": "retail"}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  billing_model = EXCLUDED.billing_model,
  base_price_lkr = EXCLUDED.base_price_lkr,
  metadata = EXCLUDED.metadata,
  updated_at = now();
