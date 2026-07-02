-- U-26: expose per-item available_qty on public menu RPC (tasha.lk stock badges).
-- Priority: prep/display stock → recipe ingredient yield → null (unlimited).

DROP FUNCTION IF EXISTS public.get_cafe_public_menu(uuid);

CREATE OR REPLACE FUNCTION public.get_cafe_public_menu(p_company_id uuid)
RETURNS TABLE (
  item_id uuid,
  item_name text,
  category_name text,
  category_sort int,
  selling_price_lkr numeric,
  image_url text,
  available_qty int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH location_ctx AS (
    SELECT
      COALESCE(l.global_overhead_pct, 20) AS overhead_pct,
      COALESCE((snap.payload->>'showItemImages')::boolean, true) AS show_item_images,
      snap.payload AS snapshot_payload
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
  ),
  ingredient_stock AS (
    SELECT
      ing->>'id' AS ingredient_id,
      COALESCE((ing->>'currentStock')::numeric, 0) AS current_stock
    FROM location_ctx ctx
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(ctx.snapshot_payload->'ingredients', '[]'::jsonb)
    ) AS ing
  ),
  snapshot_menu_recipes AS (
    SELECT
      (elem->>'id')::uuid AS menu_item_id,
      elem->'recipe' AS recipe_json
    FROM location_ctx ctx
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(ctx.snapshot_payload->'menuItems', '[]'::jsonb)
    ) AS elem
    WHERE (elem->>'id') ~* '^[0-9a-f-]{36}$'
  ),
  recipe_available AS (
    SELECT
      smr.menu_item_id,
      MIN(
        CASE
          WHEN COALESCE((line->>'quantity')::numeric, 0) <= 0 THEN 0
          ELSE FLOOR(COALESCE(ist.current_stock, 0) / (line->>'quantity')::numeric)
        END
      )::int AS available_qty
    FROM snapshot_menu_recipes smr
    CROSS JOIN LATERAL jsonb_array_elements(smr.recipe_json) AS line
    LEFT JOIN ingredient_stock ist ON ist.ingredient_id = (line->>'ingredientId')
    WHERE smr.recipe_json IS NOT NULL
      AND jsonb_typeof(smr.recipe_json) = 'array'
      AND jsonb_array_length(smr.recipe_json) > 0
    GROUP BY smr.menu_item_id
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
    END AS image_url,
    CASE
      WHEN prep.id IS NOT NULL AND prep.item_kind = 'PREP' THEN
        GREATEST(0, FLOOR(prep.current_stock))::int
      WHEN prep.id IS NOT NULL AND prep.item_kind = 'DISPLAY' THEN
        GREATEST(
          0,
          FLOOR(
            COALESCE(prep.current_slices, 0)
            + COALESCE(prep.current_whole, 0) * COALESCE(prep.slices_per_whole, 10)
          )
        )::int
      WHEN smr.recipe_json IS NOT NULL
        AND jsonb_typeof(smr.recipe_json) = 'array'
        AND jsonb_array_length(smr.recipe_json) = 0 THEN
        0
      WHEN ra.available_qty IS NOT NULL THEN
        GREATEST(0, ra.available_qty)
      ELSE
        NULL
    END AS available_qty
  FROM cafe_menu_items i
  INNER JOIN cafe_menu_categories c ON c.id = i.category_id
  CROSS JOIN location_ctx ctx
  LEFT JOIN cafe_prep_items prep
    ON prep.company_id = i.company_id
   AND prep.menu_item_id = i.id
  LEFT JOIN snapshot_menu_recipes smr ON smr.menu_item_id = i.id
  LEFT JOIN recipe_available ra ON ra.menu_item_id = i.id
  WHERE i.company_id = p_company_id
    AND c.company_id = p_company_id
    AND i.pos_synced_at IS NOT NULL
  ORDER BY c.sort_order, c.name, i.name;
$$;

REVOKE ALL ON FUNCTION public.get_cafe_public_menu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_menu(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cafe_public_menu IS
  'Read-only public menu for customer-facing sites. Selling price = recipe cost with location overhead and target margin. available_qty = prep/display stock or min ingredient yield; null = unlimited.';
