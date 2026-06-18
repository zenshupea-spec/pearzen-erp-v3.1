-- CTA body: lead with call or request a site assessment.

UPDATE public.md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite,ctaBody}',
  '"Call 0753 632 000 or request a site assessment — we will scope guard headcount, shift patterns, and client portal access so your stakeholders see GPS-verified proof from day one."'::jsonb,
  true
)
WHERE setting_value->'_securityWebsite'->>'ctaBody' LIKE 'Request a site assessment —%';
