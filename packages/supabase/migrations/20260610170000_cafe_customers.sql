-- Café customer registry: phone lookup, spend totals, loyalty discounts.

CREATE TABLE IF NOT EXISTS cafe_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  phone_normalized text NOT NULL,
  customer_name text NOT NULL DEFAULT '',
  total_spent_lkr numeric(14, 2) NOT NULL DEFAULT 0,
  order_count int NOT NULL DEFAULT 0,
  discount_pct numeric(5, 2) NOT NULL DEFAULT 0
    CHECK (discount_pct >= 0 AND discount_pct <= 100),
  last_order_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_cafe_customers_company_spent
  ON cafe_customers (company_id, total_spent_lkr DESC);

ALTER TABLE cafe_customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_customers
    ON cafe_customers FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.normalize_cafe_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

-- Backfill from historical orders (latest name per phone).
WITH order_stats AS (
  SELECT
    company_id,
    public.normalize_cafe_phone(customer_phone) AS phone_normalized,
    COALESCE(SUM(total_lkr) FILTER (WHERE status <> 'CANCELLED'), 0) AS total_spent_lkr,
    COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS order_count,
    MAX(placed_at) FILTER (WHERE status <> 'CANCELLED') AS last_order_at
  FROM cafe_customer_orders
  WHERE public.normalize_cafe_phone(customer_phone) IS NOT NULL
  GROUP BY company_id, public.normalize_cafe_phone(customer_phone)
),
latest_names AS (
  SELECT DISTINCT ON (company_id, phone_normalized)
    company_id,
    phone_normalized,
    customer_name
  FROM (
    SELECT
      company_id,
      public.normalize_cafe_phone(customer_phone) AS phone_normalized,
      customer_name,
      placed_at
    FROM cafe_customer_orders
    WHERE status <> 'CANCELLED'
      AND public.normalize_cafe_phone(customer_phone) IS NOT NULL
  ) ranked
  ORDER BY company_id, phone_normalized, placed_at DESC
)
INSERT INTO cafe_customers (
  company_id,
  phone_normalized,
  customer_name,
  total_spent_lkr,
  order_count,
  last_order_at
)
SELECT
  s.company_id,
  s.phone_normalized,
  COALESCE(n.customer_name, ''),
  s.total_spent_lkr,
  s.order_count,
  s.last_order_at
FROM order_stats s
LEFT JOIN latest_names n
  ON n.company_id = s.company_id
 AND n.phone_normalized = s.phone_normalized
ON CONFLICT (company_id, phone_normalized) DO NOTHING;

CREATE OR REPLACE FUNCTION public.lookup_cafe_customer_by_phone(
  p_company_id uuid,
  p_phone text
)
RETURNS TABLE (
  customer_name text,
  discount_pct numeric,
  total_spent_lkr numeric,
  order_count int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  v_phone := public.normalize_cafe_phone(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 9 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.customer_name,
    c.discount_pct,
    c.total_spent_lkr,
    c.order_count
  FROM cafe_customers c
  WHERE c.company_id = p_company_id
    AND c.phone_normalized = v_phone
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_cafe_customer_by_phone(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_cafe_customer_by_phone(uuid, text) TO anon, authenticated;

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
  v_total numeric;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id required';
  END IF;

  v_phone := public.normalize_cafe_phone(p_customer_phone);
  v_name := trim(p_customer_name);
  v_total := COALESCE(p_total_lkr, 0);

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
    v_total,
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
      total_spent_lkr,
      order_count,
      last_order_at,
      updated_at
    )
    VALUES (
      p_company_id,
      v_phone,
      v_name,
      v_total,
      1,
      now(),
      now()
    )
    ON CONFLICT (company_id, phone_normalized) DO UPDATE SET
      customer_name = EXCLUDED.customer_name,
      total_spent_lkr = cafe_customers.total_spent_lkr + EXCLUDED.total_spent_lkr,
      order_count = cafe_customers.order_count + 1,
      last_order_at = now(),
      updated_at = now();
  END IF;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric, text) TO anon, authenticated;
