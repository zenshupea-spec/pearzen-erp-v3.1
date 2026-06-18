-- Expose configurable cover photo tint strength for the public customer menu.

DROP FUNCTION IF EXISTS public.get_cafe_public_branding(uuid);

CREATE OR REPLACE FUNCTION public.get_cafe_public_branding(p_company_id uuid)
RETURNS TABLE (
  cafe_name text,
  logo_url text,
  cover_url text,
  cover_text_color text,
  cover_tint_strength int,
  show_item_images boolean
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
    COALESCE((snap.payload->>'showItemImages')::boolean, true) AS show_item_images
  FROM cafe_locations l
  LEFT JOIN LATERAL (
    SELECT payload
    FROM cafe_dashboard_snapshots
    WHERE company_id = l.company_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  ) snap ON true
  WHERE l.company_id = p_company_id
  ORDER BY l.created_at NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_cafe_public_branding IS
  'Read-only branding for customer-facing menu sites. Includes cover tint strength (0–100, default 100).';
