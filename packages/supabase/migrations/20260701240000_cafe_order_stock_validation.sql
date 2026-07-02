-- Server-side stock validation for public customer orders (matches get_cafe_public_menu caps).

CREATE OR REPLACE FUNCTION public.cafe_reserved_menu_qty(
  p_company_id uuid,
  p_menu_item_id uuid
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM((line->>'qty')::int), 0)::int
  FROM cafe_customer_orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) AS line
  WHERE o.company_id = p_company_id
    AND o.status IN ('PLACED', 'PAYMENT_RECEIVED', 'PREPARING', 'READY')
    AND (line->>'menuItemId') ~* '^[0-9a-f-]{36}$'
    AND (line->>'menuItemId')::uuid = p_menu_item_id;
$$;

CREATE OR REPLACE FUNCTION public.validate_cafe_order_menu_stock(
  p_company_id uuid,
  p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line record;
  v_avail int;
  v_reserved int;
  v_remaining int;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'order_items_required: Add at least one menu item.';
  END IF;

  FOR line IN
    SELECT
      (elem->>'menuItemId')::uuid AS menu_item_id,
      SUM(GREATEST((elem->>'qty')::int, 0))::int AS qty,
      MAX(NULLIF(trim(elem->>'name'), '')) AS item_name
    FROM jsonb_array_elements(p_items) AS elem
    WHERE (elem->>'menuItemId') ~* '^[0-9a-f-]{36}$'
    GROUP BY (elem->>'menuItemId')::uuid
  LOOP
    IF line.menu_item_id IS NULL OR line.qty <= 0 THEN
      RAISE EXCEPTION 'invalid_item: Each line needs a menu item and quantity.';
    END IF;

    SELECT m.available_qty
    INTO v_avail
    FROM public.get_cafe_public_menu(p_company_id) m
    WHERE m.item_id = line.menu_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'menu_item_unavailable: % is not on the live menu.', COALESCE(line.item_name, 'Item');
    END IF;

    IF v_avail IS NULL THEN
      CONTINUE;
    END IF;

    v_reserved := public.cafe_reserved_menu_qty(p_company_id, line.menu_item_id);
    v_remaining := GREATEST(0, v_avail - v_reserved);

    IF line.qty > v_remaining THEN
      RAISE EXCEPTION
        'insufficient_stock: Only % of % left (% already in the queue).',
        v_remaining,
        COALESCE(line.item_name, 'item'),
        v_reserved;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.place_cafe_customer_order(
  p_company_id uuid,
  p_fulfillment_type text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_items jsonb,
  p_total_lkr numeric,
  p_payment_method text DEFAULT 'card_online'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue int;
  v_order_id uuid;
  v_phone text;
  v_name text;
  v_open_start text;
  v_open_end text;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  SELECT h.open_start, h.open_end
  INTO v_open_start, v_open_end
  FROM public.cafe_open_hours_for_company(p_company_id) h;

  IF NOT public.is_within_cafe_open_hours(
    COALESCE(v_open_start, '07:00'),
    COALESCE(v_open_end, '19:00')
  ) THEN
    RAISE EXCEPTION 'cafe_closed: Online orders are only accepted during café open hours.';
  END IF;

  PERFORM public.validate_cafe_order_menu_stock(p_company_id, p_items);

  v_phone := public.normalize_cafe_phone(p_customer_phone);
  v_name := trim(p_customer_name);

  SELECT COALESCE(MAX(queue_number), 0) + 1
  INTO v_queue
  FROM cafe_customer_orders
  WHERE company_id = p_company_id
    AND placed_at::date = CURRENT_DATE;

  INSERT INTO cafe_customer_orders (
    company_id,
    queue_number,
    fulfillment_type,
    customer_name,
    customer_phone,
    delivery_address,
    items,
    total_lkr,
    status,
    payment_method,
    payment_status
  )
  VALUES (
    p_company_id,
    v_queue,
    COALESCE(NULLIF(trim(p_fulfillment_type), ''), 'dine-in'),
    v_name,
    trim(p_customer_phone),
    NULLIF(trim(p_delivery_address), ''),
    COALESCE(p_items, '[]'::jsonb),
    COALESCE(p_total_lkr, 0),
    'PLACED',
    COALESCE(NULLIF(trim(p_payment_method), ''), 'card_online'),
    'pending'
  )
  RETURNING id INTO v_order_id;

  IF v_phone IS NOT NULL AND length(v_phone) >= 9 AND v_name <> '' THEN
    INSERT INTO cafe_customers (
      company_id,
      phone_normalized,
      customer_name,
      updated_at
    )
    VALUES (
      p_company_id,
      v_phone,
      v_name,
      now()
    )
    ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      updated_at = now();
  END IF;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cafe_reserved_menu_qty(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cafe_reserved_menu_qty(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.validate_cafe_order_menu_stock(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_cafe_order_menu_stock(uuid, jsonb) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) TO anon, authenticated;

COMMENT ON FUNCTION public.validate_cafe_order_menu_stock IS
  'Ensures order lines respect get_cafe_public_menu available_qty minus active queue reservations.';

COMMENT ON FUNCTION public.place_cafe_customer_order IS
  'Public customer menu order placement; enforces open hours and live menu stock caps.';
