-- AR invoicing, café operations, and FM portfolio persistence

-- ─── AR Invoicing ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_code text NOT NULL,
  client_name text NOT NULL,
  sector text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  purchaser_tin text NOT NULL DEFAULT '',
  invoice_contact_name text NOT NULL DEFAULT '',
  invoice_contact_phone text NOT NULL DEFAULT '',
  site_profile_id uuid REFERENCES site_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_code)
);

CREATE TABLE IF NOT EXISTS ar_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  billing_client_id uuid NOT NULL REFERENCES billing_clients(id) ON DELETE CASCADE,
  month_key text NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  status text NOT NULL DEFAULT 'NONE',
  invoice_no text NOT NULL DEFAULT '',
  total_amount_lkr numeric(14,2) NOT NULL DEFAULT 0,
  dispatched boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_client_id, month_key)
);

CREATE TABLE IF NOT EXISTS ar_tax_invoice_sequences (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  last_sequence int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ar_ledger_snapshots (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  dispatched text[] NOT NULL DEFAULT '{}',
  tax_seq jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── FM portfolio ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fm_shift_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  site_key text NOT NULL,
  payroll_month text NOT NULL,
  delta_shifts int NOT NULL,
  previous_shifts int NOT NULL,
  new_shifts int NOT NULL,
  source text NOT NULL DEFAULT 'FM',
  detail text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fm_shift_adjustments_lookup_idx
  ON fm_shift_adjustments (company_id, payroll_month, site_key, employee_id);

-- ─── Café backoffice ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cafe_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Café Tasha',
  logo_url text,
  global_overhead_pct numeric(5,2) NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS cafe_staff_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  daily_rate_lkr numeric(10,2) NOT NULL DEFAULT 0,
  days_worked int NOT NULL DEFAULT 0,
  deductions_mtd_lkr numeric(12,2) NOT NULL DEFAULT 0,
  role_label text NOT NULL DEFAULT '',
  UNIQUE (employee_id, period_month)
);

CREATE TABLE IF NOT EXISTS cafe_task_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cafe_location_id uuid NOT NULL REFERENCES cafe_locations(id) ON DELETE CASCADE,
  name text NOT NULL,
  freq text NOT NULL CHECK (freq IN ('DAILY', 'WEEKLY')),
  assigned_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS cafe_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES cafe_task_templates(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('COMPLETE', 'PENDING', 'OVERDUE')),
  proof_uploaded_at date,
  purge_after date,
  UNIQUE (template_id, completion_date)
);

CREATE TABLE IF NOT EXISTS cafe_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_type text NOT NULL CHECK (list_type IN ('DAILY', 'BULK')),
  name text NOT NULL,
  unit text NOT NULL,
  assigned_name text NOT NULL DEFAULT '',
  bulk_period_days int
);

CREATE TABLE IF NOT EXISTS cafe_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES cafe_stock_items(id) ON DELETE CASCADE,
  count_date date NOT NULL,
  opening_stock numeric(12,3),
  closing_stock numeric(12,3),
  pos_sold numeric(12,3),
  logged_wastage numeric(12,3) DEFAULT 0,
  theoretical_stock numeric(12,3),
  physical_count numeric(12,3),
  UNIQUE (stock_item_id, count_date)
);

CREATE TABLE IF NOT EXISTS cafe_pos_voids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  voided_at timestamptz NOT NULL DEFAULT now(),
  item_description text NOT NULL,
  amount_lkr numeric(12,2) NOT NULL,
  voided_by_name text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  flagged boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS cafe_prep_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL,
  item_kind text NOT NULL CHECK (item_kind IN ('PREP', 'DISPLAY')),
  slices_per_whole int,
  shelf_life_days int NOT NULL DEFAULT 1,
  rolling_avg_14d numeric(10,2) NOT NULL DEFAULT 0,
  current_stock numeric(12,3) NOT NULL DEFAULT 0,
  current_whole numeric(12,3),
  current_slices numeric(12,3)
);

CREATE TABLE IF NOT EXISTS cafe_menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS cafe_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES cafe_menu_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  recipe_cost_lkr numeric(10,2) NOT NULL DEFAULT 0,
  target_margin_pct numeric(5,2) NOT NULL DEFAULT 0,
  image_url text,
  pos_synced_at timestamptz
);

CREATE TABLE IF NOT EXISTS cafe_dashboard_snapshots (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE billing_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_tax_invoice_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_ledger_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fm_shift_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_staff_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_pos_voids ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_prep_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_dashboard_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_billing_clients ON billing_clients FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_ar_invoices ON ar_invoices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_ar_tax_seq ON ar_tax_invoice_sequences FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_ar_ledger_snapshots ON ar_ledger_snapshots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_fm_shift_adjustments ON fm_shift_adjustments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_locations ON cafe_locations FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_staff_periods ON cafe_staff_periods FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_task_templates ON cafe_task_templates FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_task_completions ON cafe_task_completions FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_stock_items ON cafe_stock_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_stock_counts ON cafe_stock_counts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_pos_voids ON cafe_pos_voids FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_prep_items ON cafe_prep_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_menu_categories ON cafe_menu_categories FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_menu_items ON cafe_menu_items FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY service_role_cafe_dashboard_snapshots ON cafe_dashboard_snapshots FOR ALL USING (auth.role() = 'service_role');
