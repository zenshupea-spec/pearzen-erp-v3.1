-- Expose MD café open hours on the public customer menu branding RPC.

DROP FUNCTION IF EXISTS public.get_cafe_public_branding(uuid);

CREATE OR REPLACE FUNCTION public.get_cafe_public_branding(p_company_id uuid)
RETURNS TABLE (
  cafe_name text,
  logo_url text,
  cover_url text,
  cover_text_color text,
  cover_tint_strength int,
  show_item_images boolean,
  cafe_open_start text,
  cafe_open_end text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(trim(l.name), ''), 'Our Menu') AS cafe_name,
    COALESCE(
      NULLIF(trim(l.logo_url), ''),
      NULLIF(trim(snap.payload->>'cafeLogoUrl'), '')
    ) AS logo_url,
    NULLIF(trim(snap.payload->>'cafeCoverUrl'), '') AS cover_url,
    COALESCE(NULLIF(trim(snap.payload->>'cafeCoverTextColor'), ''), '#ffffff') AS cover_text_color,
    COALESCE((snap.payload->>'cafeCoverTintStrength')::int, 100) AS cover_tint_strength,
    COALESCE((snap.payload->>'showItemImages')::boolean, true) AS show_item_images,
    COALESCE(
      NULLIF(trim(ms.setting_value->'_engineConstants'->>'cafeOpenStart'), ''),
      '07:00'
    ) AS cafe_open_start,
    COALESCE(
      NULLIF(trim(ms.setting_value->'_engineConstants'->>'cafeOpenEnd'), ''),
      '19:00'
    ) AS cafe_open_end
  FROM cafe_locations l
  LEFT JOIN LATERAL (
    SELECT payload
    FROM cafe_dashboard_snapshots
    WHERE company_id = l.company_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ) snap ON true
  LEFT JOIN md_settings ms ON ms.company_id = l.company_id
  WHERE l.company_id = p_company_id
  ORDER BY l.created_at NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_cafe_public_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_branding(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cafe_public_branding IS
  'Read-only branding for customer-facing menu sites. Includes open hours from MD engine constants.';
