-- Block customer orders outside MD-configured café open hours.

CREATE OR REPLACE FUNCTION public.is_within_cafe_open_hours(
  p_open_start text,
  p_open_end text,
  p_now time DEFAULT LOCALTIME
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_start_mins int;
  v_end_mins int;
  v_now_mins int;
  v_start text;
  v_end text;
BEGIN
  v_start := COALESCE(NULLIF(trim(p_open_start), ''), '07:00');
  v_end := COALESCE(NULLIF(trim(p_open_end), ''), '19:00');

  v_start_mins := (split_part(v_start, ':', 1)::int * 60) + split_part(v_start, ':', 2)::int;
  v_end_mins := (split_part(v_end, ':', 1)::int * 60) + split_part(v_end, ':', 2)::int;
  v_now_mins := (EXTRACT(HOUR FROM p_now)::int * 60) + EXTRACT(MINUTE FROM p_now)::int;

  IF v_start_mins <= v_end_mins THEN
    RETURN v_now_mins >= v_start_mins AND v_now_mins <= v_end_mins;
  END IF;

  RETURN v_now_mins >= v_start_mins OR v_now_mins <= v_end_mins;
END;
$$;

CREATE OR REPLACE FUNCTION public.cafe_open_hours_for_company(p_company_id uuid)
RETURNS TABLE (open_start text, open_end text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      NULLIF(trim(ms.setting_value->'_engineConstants'->>'cafeOpenStart'), ''),
      '07:00'
    ) AS open_start,
    COALESCE(
      NULLIF(trim(ms.setting_value->'_engineConstants'->>'cafeOpenEnd'), ''),
      '19:00'
    ) AS open_end
  FROM md_settings ms
  WHERE ms.company_id = p_company_id
  LIMIT 1;
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

REVOKE ALL ON FUNCTION public.is_within_cafe_open_hours(text, text, time) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_within_cafe_open_hours(text, text, time) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.cafe_open_hours_for_company(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cafe_open_hours_for_company(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.is_within_cafe_open_hours IS
  'True when p_now falls within HH:MM open window (supports overnight spans).';

COMMENT ON FUNCTION public.place_cafe_customer_order IS
  'Public customer menu order placement; rejects orders outside café open hours.';
