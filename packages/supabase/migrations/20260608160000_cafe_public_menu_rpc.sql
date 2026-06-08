-- Public café menu catalog: anon-safe RPC (no recipe costs, margins, or staff tables).

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
  SELECT
    i.id AS item_id,
    i.name AS item_name,
    c.name AS category_name,
    c.sort_order AS category_sort,
    CASE
      WHEN i.target_margin_pct >= 99 THEN ROUND(i.recipe_cost_lkr * 10)
      ELSE ROUND(i.recipe_cost_lkr / NULLIF(1 - (i.target_margin_pct / 100), 0))
    END AS selling_price_lkr,
    i.image_url
  FROM cafe_menu_items i
  INNER JOIN cafe_menu_categories c ON c.id = i.category_id
  WHERE i.company_id = p_company_id
    AND c.company_id = p_company_id
    AND i.pos_synced_at IS NOT NULL
  ORDER BY c.sort_order, c.name, i.name;
$$;

REVOKE ALL ON FUNCTION public.get_cafe_public_menu(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_public_menu(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cafe_public_menu IS
  'Read-only public menu for customer-facing sites. Exposes selling price only — never recipe cost or margin.';
