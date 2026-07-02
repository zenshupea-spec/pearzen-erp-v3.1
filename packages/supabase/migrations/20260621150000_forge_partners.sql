-- SaaS Forge — independent service partner layer (ISP managers / referrers).

CREATE TABLE IF NOT EXISTS public.forge_service_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  email text NOT NULL UNIQUE,
  referral_code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_service_partners_active_idx
  ON public.forge_service_partners (is_active, created_at DESC);

COMMENT ON TABLE public.forge_service_partners IS
  'Independent service partners (ISP managers) — not Forge operators, not tenant staff.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forge_partner_deal_type') THEN
    CREATE TYPE public.forge_partner_deal_type AS ENUM (
      'saas_erp',
      'wfm_tool',
      'custom_software',
      'website_build'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forge_partner_portfolio_status') THEN
    CREATE TYPE public.forge_partner_portfolio_status AS ENUM ('active', 'churned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'forge_payout_source_type') THEN
    CREATE TYPE public.forge_payout_source_type AS ENUM ('saas_platform', 'forge_product');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.forge_partner_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.forge_service_partners(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  deal_type public.forge_partner_deal_type NOT NULL DEFAULT 'saas_erp',
  referral_code text,
  closed_at date NOT NULL DEFAULT CURRENT_DATE,
  status public.forge_partner_portfolio_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, company_id)
);

CREATE INDEX IF NOT EXISTS forge_partner_portfolios_partner_idx
  ON public.forge_partner_portfolios (partner_id, status, closed_at DESC);

CREATE INDEX IF NOT EXISTS forge_partner_portfolios_company_idx
  ON public.forge_partner_portfolios (company_id);

COMMENT ON TABLE public.forge_partner_portfolios IS
  'Closed-client links between a service partner and a tenant company.';

CREATE TABLE IF NOT EXISTS public.forge_payout_rules (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  month_one_partner_lkr numeric(12, 2) NOT NULL DEFAULT 5000,
  month_one_pearzen_lkr numeric(12, 2) NOT NULL DEFAULT 5000,
  month_two_plus_partner_lkr numeric(12, 2) NOT NULL DEFAULT 1000,
  month_two_plus_pearzen_lkr numeric(12, 2) NOT NULL DEFAULT 3000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.forge_payout_rules (
  singleton,
  month_one_partner_lkr,
  month_one_pearzen_lkr,
  month_two_plus_partner_lkr,
  month_two_plus_pearzen_lkr
)
VALUES (true, 5000, 5000, 1000, 3000)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.forge_payout_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.forge_service_partners(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.forge_partner_portfolios(id) ON DELETE SET NULL,
  billing_month date NOT NULL,
  partner_share_lkr numeric(12, 2) NOT NULL,
  pearzen_share_lkr numeric(12, 2) NOT NULL,
  source_type public.forge_payout_source_type NOT NULL,
  source_invoice_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_payout_ledger_partner_idx
  ON public.forge_payout_ledger (partner_id, billing_month DESC, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS forge_payout_ledger_source_unique
  ON public.forge_payout_ledger (source_type, source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

COMMENT ON TABLE public.forge_payout_ledger IS
  'Partner revenue-share entries created when referred-tenant invoices are marked paid.';

-- Link commerce purchases to partners when partner_id is set.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'forge_product_purchases'
      AND column_name = 'partner_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'forge_product_purchases_partner_id_fkey'
  ) THEN
    ALTER TABLE public.forge_product_purchases
      ADD CONSTRAINT forge_product_purchases_partner_id_fkey
      FOREIGN KEY (partner_id) REFERENCES public.forge_service_partners(id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.forge_service_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_partner_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_payout_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_payout_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_read_self ON public.forge_service_partners;
DROP POLICY IF EXISTS service_role_partners ON public.forge_service_partners;
DROP POLICY IF EXISTS partner_read_portfolio ON public.forge_partner_portfolios;
DROP POLICY IF EXISTS partner_update_portfolio ON public.forge_partner_portfolios;
DROP POLICY IF EXISTS service_role_portfolios ON public.forge_partner_portfolios;
DROP POLICY IF EXISTS partner_read_payouts ON public.forge_payout_ledger;
DROP POLICY IF EXISTS service_role_payouts ON public.forge_payout_ledger;
DROP POLICY IF EXISTS service_role_payout_rules ON public.forge_payout_rules;

CREATE POLICY partner_read_self
  ON public.forge_service_partners FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY service_role_partners
  ON public.forge_service_partners FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY partner_read_portfolio
  ON public.forge_partner_portfolios FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY partner_update_portfolio
  ON public.forge_partner_portfolios FOR UPDATE
  TO authenticated
  USING (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY service_role_portfolios
  ON public.forge_partner_portfolios FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY partner_read_payouts
  ON public.forge_payout_ledger FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT id FROM public.forge_service_partners WHERE user_id = auth.uid()
    )
  );

CREATE POLICY service_role_payouts
  ON public.forge_payout_ledger FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY service_role_payout_rules
  ON public.forge_payout_rules FOR ALL
  USING (auth.role() = 'service_role');
