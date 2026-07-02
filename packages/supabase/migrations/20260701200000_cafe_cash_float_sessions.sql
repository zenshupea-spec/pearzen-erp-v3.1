-- Café cash float reconciliation — opening float + POS cash sales vs physical count.

CREATE TABLE IF NOT EXISTS cafe_cash_float_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cafe_location_id uuid NOT NULL REFERENCES cafe_locations(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  opening_float_lkr integer NOT NULL DEFAULT 0 CHECK (opening_float_lkr >= 0),
  pos_cash_sales_lkr integer NOT NULL DEFAULT 0 CHECK (pos_cash_sales_lkr >= 0),
  expected_cash_lkr integer NOT NULL DEFAULT 0 CHECK (expected_cash_lkr >= 0),
  declared_cash_lkr integer CHECK (declared_cash_lkr IS NULL OR declared_cash_lkr >= 0),
  variance_lkr integer,
  notes text NOT NULL DEFAULT '',
  reconciled_by text,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, cafe_location_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_cafe_cash_float_sessions_company_date
  ON cafe_cash_float_sessions (company_id, business_date DESC);

ALTER TABLE cafe_cash_float_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_cash_float_sessions
    ON cafe_cash_float_sessions FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS tenant_select_cafe_cash_float_sessions ON public.cafe_cash_float_sessions;
CREATE POLICY tenant_select_cafe_cash_float_sessions
  ON public.cafe_cash_float_sessions
  FOR SELECT
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));

DROP POLICY IF EXISTS tenant_write_cafe_cash_float_sessions ON public.cafe_cash_float_sessions;
CREATE POLICY tenant_write_cafe_cash_float_sessions
  ON public.cafe_cash_float_sessions
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT public.tenant_company_ids_for_auth_user()))
  WITH CHECK (company_id IN (SELECT public.tenant_company_ids_for_auth_user()));
