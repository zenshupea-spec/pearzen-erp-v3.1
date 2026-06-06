-- Gratuity provision (MD / FM shared finance settings)

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS gratuity_settings jsonb DEFAULT '{"minYears":5,"monthlyBasicDivisor":2}'::jsonb;
