-- Employee welfare fund: fixed monthly deduction per employee (MD / FM shared)

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS welfare_fund_settings jsonb DEFAULT '{"monthlyDeductionLkr":500}'::jsonb;
