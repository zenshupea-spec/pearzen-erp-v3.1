-- Only count customer spend after café staff accept the order (accepted_at set).

CREATE OR REPLACE FUNCTION public.upsert_cafe_customer_on_order_accepted(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order cafe_customer_orders%ROWTYPE;
  v_phone text;
BEGIN
  SELECT * INTO v_order
  FROM cafe_customer_orders
  WHERE id = p_order_id;

  IF NOT FOUND OR v_order.accepted_at IS NULL OR v_order.status = 'CANCELLED' THEN
    RETURN;
  END IF;

  v_phone := public.normalize_cafe_phone(v_order.customer_phone);
  IF v_phone IS NULL OR length(v_phone) < 9 OR trim(v_order.customer_name) = '' THEN
    RETURN;
  END IF;

  INSERT INTO cafe_customers (
    company_id,
    phone_normalized,
    customer_name,
    total_spent_lkr,
    order_count,
    last_order_at,
    updated_at
  )
  VALUES (
    v_order.company_id,
    v_phone,
    trim(v_order.customer_name),
    COALESCE(v_order.total_lkr, 0),
    1,
    v_order.accepted_at,
    now()
  )
  ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
    customer_name = EXCLUDED.customer_name,
    total_spent_lkr = cafe_customers.total_spent_lkr + EXCLUDED.total_spent_lkr,
    order_count = cafe_customers.order_count + 1,
    last_order_at = GREATEST(cafe_customers.last_order_at, EXCLUDED.last_order_at),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_cafe_customer_order_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accepted_at IS NOT NULL AND (OLD.accepted_at IS NULL OR TG_OP = 'INSERT') THEN
    PERFORM public.upsert_cafe_customer_on_order_accepted(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cafe_customer_order_accepted ON cafe_customer_orders;
CREATE TRIGGER cafe_customer_order_accepted
  AFTER UPDATE OF accepted_at ON cafe_customer_orders
  FOR EACH ROW
  WHEN (OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL)
  EXECUTE FUNCTION public.trg_cafe_customer_order_accepted();

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
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
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

  -- Remember name for phone lookup; spend is recorded when staff accept the order.
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

-- Recalculate spend from accepted orders only.
WITH accepted_stats AS (
  SELECT
    company_id,
    public.normalize_cafe_phone(customer_phone) AS phone_normalized,
    COALESCE(SUM(total_lkr), 0) AS total_spent_lkr,
    COUNT(*)::int AS order_count,
    MAX(accepted_at) AS last_order_at
  FROM cafe_customer_orders
  WHERE accepted_at IS NOT NULL
    AND status <> 'CANCELLED'
    AND public.normalize_cafe_phone(customer_phone) IS NOT NULL
  GROUP BY company_id, public.normalize_cafe_phone(customer_phone)
)
UPDATE cafe_customers c
SET
  total_spent_lkr = s.total_spent_lkr,
  order_count = s.order_count,
  last_order_at = s.last_order_at,
  updated_at = now()
FROM accepted_stats s
WHERE c.company_id = s.company_id
  AND c.phone_normalized = s.phone_normalized;

UPDATE cafe_customers c
SET
  total_spent_lkr = 0,
  order_count = 0,
  last_order_at = NULL,
  updated_at = now()
WHERE NOT EXISTS (
  SELECT 1
  FROM cafe_customer_orders o
  WHERE o.company_id = c.company_id
    AND public.normalize_cafe_phone(o.customer_phone) = c.phone_normalized
    AND o.accepted_at IS NOT NULL
    AND o.status <> 'CANCELLED'
);

REVOKE ALL ON FUNCTION public.upsert_cafe_customer_on_order_accepted(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_cafe_customer_on_order_accepted(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) TO anon, authenticated;
