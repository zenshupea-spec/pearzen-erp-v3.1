-- Public café branding for customer menu (logo, cover, name only — no staff or cost data).

CREATE OR REPLACE FUNCTION public.get_cafe_public_branding(p_company_id uuid)
RETURNS TABLE (
  cafe_name text,
  logo_url text,
  cover_url text,
  cover_text_color text
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
      NULLIF(trim(s.payload->>'cafeLogoUrl'), '')
    ) AS logo_url,
    NULLIF(trim(s.payload->>'cafeCoverUrl'), '') AS cover_url,
    COALESCE(NULLIF(trim(s.payload->>'cafeCoverTextColor'), ''), '#ffffff') AS cover_text_color
  FROM cafe_locations l
  LEFT JOIN cafe_dashboard_snapshots s ON s.company_id = l.company_id
  WHERE l.company_id = p_company_id
  ORDER BY l.created_at NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_cafe_public_branding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_branding(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cafe_public_branding IS
  'Read-only branding for customer-facing menu sites. No recipe costs, margins, or staff data.';
