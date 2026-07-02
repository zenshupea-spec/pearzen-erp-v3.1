-- Correct Classic Venture founding year: 2006 (not 2008) in saved CMS content.

UPDATE public.md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite}',
  replace(setting_value->'_securityWebsite'::text, '2008', '2006')::jsonb,
  true
)
WHERE setting_value ? '_securityWebsite'
  AND (setting_value->'_securityWebsite')::text LIKE '%2008%';

UPDATE public.tenant_public_sites
SET content_json = replace(content_json::text, '2008', '2006')::jsonb,
    updated_at = now()
WHERE site_type = 'security_marketing'
  AND content_json::text LIKE '%2008%';
