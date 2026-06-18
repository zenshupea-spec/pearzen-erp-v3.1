-- Services section headline: shorter, aligned with "Manpower services" eyebrow.

UPDATE public.md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite,servicesTitle}',
  '"Manpower solutions"'::jsonb,
  true
)
WHERE setting_value->'_securityWebsite'->>'servicesTitle' ILIKE '%boots on the ground%'
   OR setting_value->'_securityWebsite'->>'servicesTitle' = 'Professional manpower on every site';
