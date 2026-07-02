-- Public order status for client PWA tracking (UUID is the capability token).

CREATE OR REPLACE FUNCTION public.get_cafe_customer_order_status(p_order_id uuid)
RETURNS TABLE (
  order_id uuid,
  queue_number int,
  fulfillment_type text,
  customer_name text,
  total_lkr numeric,
  item_count int,
  status text,
  payment_method text,
  payment_status text,
  placed_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    o.id,
    o.queue_number,
    o.fulfillment_type,
    o.customer_name,
    o.total_lkr,
    COALESCE(jsonb_array_length(o.items), 0)::int,
    o.status,
    o.payment_method,
    o.payment_status,
    o.placed_at,
    o.ready_at,
    o.completed_at
  FROM cafe_customer_orders o
  WHERE o.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.get_cafe_customer_order_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cafe_customer_order_status(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_cafe_customer_order_status IS
  'Client PWA: poll order queue status by id. Does not return phone or full line items.';
