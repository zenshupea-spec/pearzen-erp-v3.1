-- Pearzen tech company marketing site content (edited from SaaS Forge by platform operators).

ALTER TABLE forge_settings
  ADD COLUMN IF NOT EXISTS pearzen_website_content jsonb;

COMMENT ON COLUMN forge_settings.pearzen_website_content IS
  'Public marketing copy for pearzen.tech — hero, products, industries, contact.';

CREATE OR REPLACE FUNCTION public.get_pearzen_public_website()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(pearzen_website_content, '{}'::jsonb)
  FROM forge_settings
  WHERE singleton = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_pearzen_public_website() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pearzen_public_website() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_pearzen_public_website IS
  'Anonymous read of Pearzen software company website content for pearzen.tech.';
