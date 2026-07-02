-- Forge editable pricing — website client charges + per-purchase metadata overrides.

ALTER TABLE public.forge_payout_rules
  ADD COLUMN IF NOT EXISTS month_one_client_lkr numeric(12, 2) NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS month_two_plus_client_lkr numeric(12, 2) NOT NULL DEFAULT 5000;

COMMENT ON COLUMN public.forge_payout_rules.month_one_client_lkr IS
  'Default website client charge in month 1 (setup + launch).';

COMMENT ON COLUMN public.forge_payout_rules.month_two_plus_client_lkr IS
  'Default website client monthly charge from month 2 onward.';

UPDATE public.forge_payout_rules
SET
  month_one_client_lkr = COALESCE(month_one_client_lkr, 10000),
  month_two_plus_client_lkr = COALESCE(month_two_plus_client_lkr, 5000),
  updated_at = now()
WHERE singleton = true;

ALTER TABLE public.forge_product_purchases
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.forge_product_purchases.metadata IS
  'Per-client pricing overrides — WFM per-employee rate, custom software handover/monthly terms, etc.';

-- Seed catalog pricing metadata defaults (merge, do not overwrite operator edits).
UPDATE public.forge_product_catalog
SET
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'per_employee_lkr', COALESCE((metadata->>'per_employee_lkr')::numeric, 1500),
    'pre_handover_lkr', COALESCE((metadata->>'pre_handover_lkr')::numeric, 0),
    'post_handover_lkr', COALESCE((metadata->>'post_handover_lkr')::numeric, 0),
    'monthly_fixed_lkr', COALESCE((metadata->>'monthly_fixed_lkr')::numeric, 0),
    'monthly_per_employee_lkr', COALESCE((metadata->>'monthly_per_employee_lkr')::numeric, 0),
    'monthly_mode', COALESCE(metadata->>'monthly_mode', 'fixed')
  ),
  updated_at = now()
WHERE code IN ('wfm_tool', 'custom_software', 'website_build');

UPDATE public.forge_product_catalog
SET
  base_price_lkr = 10000,
  billing_model = 'one_time',
  metadata = COALESCE(metadata, '{}'::jsonb) || '{"month_one_label": "Setup + launch"}'::jsonb,
  updated_at = now()
WHERE code = 'website_build'
  AND base_price_lkr = 25000;
