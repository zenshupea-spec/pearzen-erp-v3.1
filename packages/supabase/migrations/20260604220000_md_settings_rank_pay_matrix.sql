-- MD Rank Pay Matrix (Executive Settings → Rank Pay Ledger)

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS rank_pay_matrix jsonb DEFAULT '[]'::jsonb;
