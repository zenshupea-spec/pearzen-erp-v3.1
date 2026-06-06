-- Uniform catalog in MD settings + consent selfie on SM uniform requests

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS uniform_catalog jsonb DEFAULT '[]'::jsonb;

ALTER TABLE sm_uniform_requests
  ADD COLUMN IF NOT EXISTS consent_selfie_url text,
  ADD COLUMN IF NOT EXISTS total_amount numeric(10,2);
