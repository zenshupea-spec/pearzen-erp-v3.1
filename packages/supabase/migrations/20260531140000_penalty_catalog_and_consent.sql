-- MD penalty catalog + SM guard consent selfies

ALTER TABLE md_settings
  ADD COLUMN IF NOT EXISTS penalty_catalog jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS replacement_catalog jsonb DEFAULT '[]'::jsonb;

ALTER TABLE sm_guard_penalties
  DROP CONSTRAINT IF EXISTS sm_guard_penalties_penalty_type_check;

ALTER TABLE sm_guard_penalties
  ADD COLUMN IF NOT EXISTS penalty_catalog_id text,
  ADD COLUMN IF NOT EXISTS consent_selfie_url text;

ALTER TABLE sm_guard_penalties
  ALTER COLUMN reason DROP NOT NULL;
