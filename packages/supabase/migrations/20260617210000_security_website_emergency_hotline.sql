-- Update Classic Venture Security emergency hotline in saved website content.

UPDATE public.md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite,contactEmergencyPhone}',
  '"0753 632 003"'::jsonb,
  true
)
WHERE setting_value ? '_securityWebsite'
  AND setting_value->'_securityWebsite' IS NOT NULL
  AND setting_value->'_securityWebsite' <> 'null'::jsonb;

UPDATE public.md_settings
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite,ctaBody}',
  to_jsonb(
    replace(
      setting_value->'_securityWebsite'->>'ctaBody',
      '0115 632 000',
      '0753 632 003'
    )
  ),
  true
)
WHERE setting_value->'_securityWebsite'->>'ctaBody' LIKE '%0115 632 000%';

UPDATE public.md_settings ms
SET setting_value = jsonb_set(
  setting_value,
  '{_securityWebsite,faq}',
  sub.patched,
  true
)
FROM (
  SELECT
    ms2.company_id,
    jsonb_agg(
      CASE
        WHEN elem->>'answer' LIKE '%0115 632 000%'
          THEN jsonb_set(
            elem,
            '{answer}',
            to_jsonb(replace(elem->>'answer', '0115 632 000', '0753 632 003'))
          )
        ELSE elem
      END
    ) AS patched
  FROM public.md_settings ms2
  CROSS JOIN LATERAL jsonb_array_elements(ms2.setting_value->'_securityWebsite'->'faq') AS elem
  WHERE jsonb_typeof(ms2.setting_value->'_securityWebsite'->'faq') = 'array'
    AND (ms2.setting_value->'_securityWebsite'->'faq')::text LIKE '%0115 632 000%'
  GROUP BY ms2.company_id
) sub
WHERE ms.company_id = sub.company_id;
