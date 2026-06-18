-- Align public menu selling prices with back-office preview (recipe cost + overhead + margin).
-- Expose showItemImages branding flag from dashboard snapshot.

CREATE OR REPLACE FUNCTION public.get_cafe_public_menu(p_company_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  category_name text,
  category_sort int,
  selling_price_lkr numeric,
  image_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH location_ctx AS (
    SELECT
      COALESCE(l.global_overhead_pct, 20) AS overhead_pct,
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
    LIMIT 1
  )
  SELECT
    i.id AS item_id,
    i.name AS item_name,
    c.name AS category_name,
    c.sort_order AS category_sort,
    CASE
      WHEN i.target_margin_pct >= 99 THEN
        ROUND(ROUND(i.recipe_cost_lkr * (1 + ctx.overhead_pct / 100)) * 10)
      ELSE
        ROUND(
          ROUND(i.recipe_cost_lkr * (1 + ctx.overhead_pct / 100))
          / NULLIF(1 - (i.target_margin_pct / 100), 0)
        )
    END AS selling_price_lkr,
    CASE
      WHEN ctx.show_item_images THEN i.image_url
      ELSE NULL
    END AS image_url
  FROM cafe_menu_items i
  INNER JOIN cafe_menu_categories c ON c.id = i.category_id
  CROSS JOIN location_ctx ctx
  WHERE i.company_id = p_company_id
    AND c.company_id = p_company_id
    AND i.pos_synced_at IS NOT NULL
  ORDER BY c.sort_order, c.name, i.name;
$$;

DROP FUNCTION IF EXISTS public.get_cafe_public_branding(uuid);

CREATE OR REPLACE FUNCTION public.get_cafe_public_branding(p_company_id uuid)
RETURNS TABLE (
  cafe_name text,
  logo_url text,
  cover_url text,
  cover_text_color text,
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

COMMENT ON FUNCTION public.get_cafe_public_menu IS
  'Read-only public menu for customer-facing sites. Selling price = recipe cost with location overhead and target margin — matches back-office preview.';

COMMENT ON FUNCTION public.get_cafe_public_branding IS
  'Read-only branding for customer-facing menu sites. Includes show_item_images from dashboard snapshot.';
