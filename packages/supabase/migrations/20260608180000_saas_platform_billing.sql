-- Pearzen SaaS platform billing (single-tenant Classic Venture)

CREATE TABLE IF NOT EXISTS saas_billing_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  database_cost_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  frontend_cost_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  per_employee_price_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  billing_start_date date NOT NULL DEFAULT CURRENT_DATE,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS saas_platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_month date NOT NULL,
  due_date date NOT NULL,
  database_cost_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  frontend_cost_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  employee_count integer NOT NULL DEFAULT 0,
  per_employee_price_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  employee_cost_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  total_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_month)
);

CREATE INDEX IF NOT EXISTS saas_platform_invoices_company_due_idx
  ON saas_platform_invoices (company_id, due_date DESC);

ALTER TABLE saas_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_platform_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_saas_billing_settings"
  ON saas_billing_settings FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_saas_platform_invoices"
  ON saas_platform_invoices FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE saas_billing_settings IS
  'Forge-managed SaaS pricing for the single production tenant';
COMMENT ON TABLE saas_platform_invoices IS
  'Monthly Pearzen.tech platform invoices surfaced in FM portal';
