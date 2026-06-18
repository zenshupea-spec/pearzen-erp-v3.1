-- Card-only online payments for café customer orders (PayHere).

ALTER TABLE cafe_customer_orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card_online'
    CHECK (payment_method IN ('card_online')),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  ADD COLUMN IF NOT EXISTS gateway_payment_id text;

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
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

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
    trim(p_customer_name),
    trim(p_customer_phone),
    NULLIF(trim(p_delivery_address), ''),
    COALESCE(p_items, '[]'::jsonb),
    COALESCE(p_total_lkr, 0),
    'PLACED',
    COALESCE(NULLIF(trim(p_payment_method), ''), 'card_online'),
    'pending'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_cafe_order_payment(
  p_order_id uuid,
  p_gateway_payment_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE cafe_customer_orders
  SET
    status = 'PAYMENT_RECEIVED',
    payment_status = 'paid',
    payment_received_at = now(),
    gateway_payment_id = NULLIF(trim(p_gateway_payment_id), '')
  WHERE id = p_order_id
    AND status = 'PLACED'
    AND payment_status = 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cafe_order_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_cafe_order_payment(uuid, text) TO service_role;
