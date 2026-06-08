-- Café Front Office: staff orders queue, menu change requests, leave, shift check-ins, prep metrics.

ALTER TABLE cafe_task_completions
  ADD COLUMN IF NOT EXISTS proof_url text;

CREATE TABLE IF NOT EXISTS cafe_staff_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT (CURRENT_DATE),
  shift_type text NOT NULL DEFAULT 'CAFE',
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  selfie_url text,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, checkin_date, shift_type)
);

CREATE INDEX IF NOT EXISTS idx_cafe_staff_checkins_company_date
  ON cafe_staff_checkins (company_id, checkin_date);

CREATE TABLE IF NOT EXISTS cafe_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text,
  UNIQUE (employee_id, leave_date)
);

CREATE TABLE IF NOT EXISTS cafe_menu_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('CHANGE_ITEM', 'ADD_ITEM')),
  menu_item_id uuid REFERENCES cafe_menu_items(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_until date,
  permanent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cafe_customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  queue_number int NOT NULL,
  fulfillment_type text NOT NULL DEFAULT 'dine-in'
    CHECK (fulfillment_type IN ('dine-in', 'takeout', 'delivery')),
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  delivery_address text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_lkr numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PLACED'
    CHECK (status IN ('PLACED', 'PAYMENT_RECEIVED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED')),
  placed_at timestamptz NOT NULL DEFAULT now(),
  payment_received_at timestamptz,
  accepted_by_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  prep_seconds int
);

CREATE INDEX IF NOT EXISTS idx_cafe_customer_orders_queue
  ON cafe_customer_orders (company_id, status, placed_at);

CREATE TABLE IF NOT EXISTS cafe_order_prep_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES cafe_menu_items(id) ON DELETE SET NULL,
  menu_item_name text NOT NULL DEFAULT '',
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES cafe_customer_orders(id) ON DELETE CASCADE,
  prep_seconds int NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cafe_order_prep_stats_item
  ON cafe_order_prep_stats (company_id, menu_item_id, employee_id);

ALTER TABLE cafe_staff_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_menu_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_order_prep_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_staff_checkins
    ON cafe_staff_checkins FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_leave_requests
    ON cafe_leave_requests FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_menu_change_requests
    ON cafe_menu_change_requests FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_customer_orders
    ON cafe_customer_orders FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY service_role_cafe_order_prep_stats
    ON cafe_order_prep_stats FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Public order placement (customer menu app).
CREATE OR REPLACE FUNCTION public.place_cafe_customer_order(
  p_company_id uuid,
  p_fulfillment_type text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_items jsonb,
  p_total_lkr numeric
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
    status
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
    'PLACED'
  )
  RETURNING id INTO v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_cafe_customer_order(uuid, text, text, text, text, jsonb, numeric) TO anon, authenticated;
