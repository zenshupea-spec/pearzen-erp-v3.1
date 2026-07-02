-- Persist commerce product hint on contact threads (WFM / custom software / website build inquiries).

ALTER TABLE public.forge_contact_threads
  ADD COLUMN IF NOT EXISTS suggested_product_code text;

COMMENT ON COLUMN public.forge_contact_threads.suggested_product_code IS
  'Forge commerce product code inferred from inbound subject/body — wfm_tool, custom_software, website_build, etc.';

CREATE INDEX IF NOT EXISTS forge_contact_threads_suggested_product_idx
  ON public.forge_contact_threads (suggested_product_code)
  WHERE suggested_product_code IS NOT NULL;
