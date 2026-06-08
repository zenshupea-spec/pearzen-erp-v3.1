-- Schema catch-up bundle: idempotent rollup for lagging deployments.
-- Covers employees MNR, md_settings, site_profiles, SM, AR/café/FM, audit, and legacy tables.
-- Safe to run multiple times.

-- ─── employees (MNR drawer, FM portfolio, onboarding, clearance) ─────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS section_edits jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS "group" text,
  ADD COLUMN IF NOT EXISTS site text,
  ADD COLUMN IF NOT EXISTS nic text,
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS mod_expiry date,
  ADD COLUMN IF NOT EXISTS police_expiry date,
  ADD COLUMN IF NOT EXISTS epf_no text,
  ADD COLUMN IF NOT EXISTS passport_no text,
  ADD COLUMN IF NOT EXISTS maternity_leave boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS id_photo_url text,
  ADD COLUMN IF NOT EXISTS id_photo_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS base_salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS requires_md_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS salary_approval_status text,
  ADD COLUMN IF NOT EXISTS custom_salary numeric(12,2),
  ADD COLUMN IF NOT EXISTS mod_clearance_url text,
  ADD COLUMN IF NOT EXISTS police_clearance_url text,
  ADD COLUMN IF NOT EXISTS grama_niladari_url text,
  ADD COLUMN IF NOT EXISTS birth_certificate_url text,
  ADD COLUMN IF NOT EXISTS servicemen_certificate_url text,
  ADD COLUMN IF NOT EXISTS nic_passport_doc_url text,
  ADD COLUMN IF NOT EXISTS fm_offboarding_payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fm_offboarding_payment_confirmed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS hr_offboarding_sent_to_fm_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_offboarding_sent_to_fm_by uuid REFERENCES auth.users(id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'basic_salary'
  ) THEN
    UPDATE employees
    SET base_salary = basic_salary
    WHERE base_salary IS NULL AND basic_salary IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'epf_num'
  ) THEN
    UPDATE employees
    SET epf_no = epf_num::text
    WHERE epf_no IS NULL AND epf_num IS NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS employees_email_lower_unique
  ON employees (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

-- ─── md_settings (Executive / Invoice / SM / vault) ─────────────────────────

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS statutory_takehome_floor numeric DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_deduction_pct numeric DEFAULT 20,
  ADD COLUMN IF NOT EXISTS penalty_catalog jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replacement_catalog jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 18,
  ADD COLUMN IF NOT EXISTS sscl_rate numeric DEFAULT 2.5641,
  ADD COLUMN IF NOT EXISTS invoice_head_office text,
  ADD COLUMN IF NOT EXISTS invoice_telephone text,
  ADD COLUMN IF NOT EXISTS invoice_email text,
  ADD COLUMN IF NOT EXISTS invoice_pv_no text,
  ADD COLUMN IF NOT EXISTS supplier_tin text,
  ADD COLUMN IF NOT EXISTS supplier_address text,
  ADD COLUMN IF NOT EXISTS company_logo_url text,
  ADD COLUMN IF NOT EXISTS rank_pay_matrix jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS gratuity_settings jsonb,
  ADD COLUMN IF NOT EXISTS welfare_fund_settings jsonb,
  ADD COLUMN IF NOT EXISTS default_geofence_radius_m integer DEFAULT 25,
  ADD COLUMN IF NOT EXISTS uniform_catalog jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS security_day_start text DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS security_day_end text DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS security_night_start text DEFAULT '19:00',
  ADD COLUMN IF NOT EXISTS security_night_end text DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS vault_auto_lock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vault_idle_timeout_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS wb_working_days integer DEFAULT 26,
  ADD COLUMN IF NOT EXISTS wb_hours integer DEFAULT 200,
  ADD COLUMN IF NOT EXISTS wb_ot_multiplier numeric DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS so_working_days integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS so_hours integer DEFAULT 180,
  ADD COLUMN IF NOT EXISTS so_ot_multiplier numeric DEFAULT 1.5;

-- ─── site_profiles (OM / SM / Master Directory) ───────────────────────────────

ALTER TABLE site_profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS verification_mode text NOT NULL DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS nfc_tag_id text,
  ADD COLUMN IF NOT EXISTS required_guards integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS assigned_sm_epf text,
  ADD COLUMN IF NOT EXISTS needs_om_gps_capture boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS location_captured_by text,
  ADD COLUMN IF NOT EXISTS site_code text,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS parent_client text,
  ADD COLUMN IF NOT EXISTS client_billing_address text,
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS contract_end date,
  ADD COLUMN IF NOT EXISTS per_visit_charge_lkr numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_dwell_time_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS site_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS rate_matrix jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_audit jsonb;

-- ─── companies (Forge tenant routing) ─────────────────────────────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_unique
  ON companies (slug)
  WHERE slug IS NOT NULL;

-- ─── sm_visit_logs (OM verification + FM portfolio date filter) ───────────────

ALTER TABLE sm_visit_logs
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS visit_date date;

UPDATE sm_visit_logs
SET visit_date = (created_at AT TIME ZONE 'UTC')::date
WHERE visit_date IS NULL AND created_at IS NOT NULL;

-- ─── sm_incident_reports (ack flags) ──────────────────────────────────────────

ALTER TABLE sm_incident_reports
  ADD COLUMN IF NOT EXISTS ack_om boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ack_sm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ack_md boolean NOT NULL DEFAULT false;

-- ─── payroll_deductions (HQ approval workflow) ──────────────────────────────────

ALTER TABLE payroll_deductions
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'APPROVED';

-- ─── executive audit ledger ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS executive_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  actor_email text,
  admin_id uuid,
  target_guard_id uuid,
  action_type text NOT NULL,
  entity text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE executive_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_executive_audit_logs
    ON executive_audit_logs FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Café roster (HR café-roster portal) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS guard_sector_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL,
  guard_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_id, guard_id)
);

CREATE TABLE IF NOT EXISTS cafe_master_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  shift_type text NOT NULL,
  guard_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE (sector_id, day_of_week, shift_type)
);

CREATE TABLE IF NOT EXISTS rostered_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sector_id uuid NOT NULL,
  guard_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  shift_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sector_id, guard_id, shift_date, shift_type)
);

ALTER TABLE guard_sector_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_master_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rostered_shifts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_guard_sector_assignments
    ON guard_sector_assignments FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_master_layouts
    ON cafe_master_layouts FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY service_role_rostered_shifts
    ON rostered_shifts FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Legacy rank matrix (Executive compensation page) ─────────────────────────

CREATE TABLE IF NOT EXISTS ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  rank_name text NOT NULL,
  rank_level int NOT NULL DEFAULT 0,
  default_basic numeric(12,2) NOT NULL DEFAULT 0,
  annual_increment numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_ranks ON ranks FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Field PWA incidents ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_number text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_incidents ON incidents FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── AR invoicing, café operations, FM portfolio (20260606140000 inline) ────────

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

-- RLS for AR / café / FM tables
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

DO $$ BEGIN CREATE POLICY service_role_billing_clients ON billing_clients FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_ar_invoices ON ar_invoices FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_ar_tax_seq ON ar_tax_invoice_sequences FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_ar_ledger_snapshots ON ar_ledger_snapshots FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_fm_shift_adjustments ON fm_shift_adjustments FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_locations ON cafe_locations FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_staff_periods ON cafe_staff_periods FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_task_templates ON cafe_task_templates FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_task_completions ON cafe_task_completions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_stock_items ON cafe_stock_items FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_stock_counts ON cafe_stock_counts FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_pos_voids ON cafe_pos_voids FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_prep_items ON cafe_prep_items FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_menu_categories ON cafe_menu_categories FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_menu_items ON cafe_menu_items FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY service_role_cafe_dashboard_snapshots ON cafe_dashboard_snapshots FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Forge settings singleton ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forge_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  operator_emails text[] NOT NULL DEFAULT ARRAY['zenshupea@gmail.com', 'shauvvvv@gmail.com']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO forge_settings (singleton, operator_emails)
VALUES (true, ARRAY['zenshupea@gmail.com', 'shauvvvv@gmail.com'])
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE forge_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_all_forge_settings
    ON forge_settings FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Storage buckets ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-hr-documents', 'employee-hr-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('sm-visit-selfies', 'sm-visit-selfies', true)
ON CONFLICT (id) DO UPDATE SET public = true;
