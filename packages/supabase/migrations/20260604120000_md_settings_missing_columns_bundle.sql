-- Bundle: columns referenced by Executive Settings / Invoice Desk but missing on some deployments.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS statutory_takehome_floor NUMERIC DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_deduction_pct NUMERIC DEFAULT 20;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS penalty_catalog jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replacement_catalog jsonb DEFAULT '[]'::jsonb;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 18,
  ADD COLUMN IF NOT EXISTS sscl_rate NUMERIC DEFAULT 2.5641,
  ADD COLUMN IF NOT EXISTS invoice_head_office TEXT,
  ADD COLUMN IF NOT EXISTS invoice_telephone TEXT,
  ADD COLUMN IF NOT EXISTS invoice_email TEXT,
  ADD COLUMN IF NOT EXISTS invoice_pv_no TEXT,
  ADD COLUMN IF NOT EXISTS supplier_tin TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address TEXT;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS company_logo_url TEXT;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS rank_pay_matrix jsonb DEFAULT '[]'::jsonb;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS gratuity_settings jsonb;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS welfare_fund_settings jsonb;

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS default_geofence_radius_m INTEGER DEFAULT 150;

ALTER TABLE md_settings
  DROP CONSTRAINT IF EXISTS md_settings_default_geofence_radius_m_check;

ALTER TABLE md_settings
  ADD CONSTRAINT md_settings_default_geofence_radius_m_check
  CHECK (default_geofence_radius_m IS NULL OR (default_geofence_radius_m >= 50 AND default_geofence_radius_m <= 500));
